/*
 * warintro.js: the player of the war's intro films (docs/campaign/
 * INTROS.md, TECH-NEEDS.md T2), in engine on the Itaipu map, and of The
 * Interior's films on its own (docs/campaign/interior/FILMS.md,
 * src/render/interiorfilms.js). A film is data on the timeline of
 * src/share/war/film.js (src/share/war/films, src/share/interior/films);
 * this draws it: the cast, the attackers, the camera, the overlays, the
 * BOARD and the room's set, the voice and the music, on one clock.
 *
 * A FILM PLAYS ONLY OVER ITS OWN MAP (the owner, 2026-10-04: mission 1's
 * film flew over the Swiss valley, #412). Given opts.map, the world
 * standing, play() refuses a film whose `map` is another (a war film
 * without one is Itaipu's).
 *
 * ONE CLOCK. The picture runs on opts.clock(), film ms: in a room the
 * room's clock less the briefing's start, so every screen is on the same
 * frame of the same shot within a frame of each other, and a screen that
 * joins late starts where the room is. The voice runs on the audio
 * context's clock, every line decoded before it is due (fetched at the
 * film's start, in the preload span, in the page's language) and
 * scheduled with AudioBufferSourceNode.start at the film ms it is cut to,
 * one anchor between the two clocks; a line already under way is started
 * from its offset, never dropped (INTROS section 0, faults 4 and 5). The
 * anchor is set again whenever the clocks part by ANCHOR_SLIP_MS, and the
 * lines not yet started go with it. The music is the war bed's 'intro',
 * from the first shot, sought to where the film is, or a film's own cues
 * (film.js musicCues), each from its anchor. Before a gesture has
 * started the audio there is no context: the film runs silent, its
 * subtitles still on the clock.
 *
 * SKIPPING (INTROS section 3). The first viewing of a film's cut is never
 * skippable. A pilot who has seen it (opts.seen) holds any key, button
 * or tap for SKIP_HOLD_MS to skip, a ring filling in the corner; letting
 * go cancels. The skip leaves the film for an orbit (opts.orbit, the
 * dam's by default) over the briefing's seconds until the room's
 * briefing ends (a host's skip also
 * asks the room to end it for everybody, which it does only when every
 * pilot there has seen it: edge/rooms/war.js). opts.onSeen() is called
 * once the film's last shot is reached on a viewing that began at its
 * first, which is what makes it seen.
 *
 * THE HAND-OFF (INTROS section 4). Over the last shot's final HANDOFF_MS
 * the camera blends from the film's to the one the shell's own chain set
 * this frame (the pilot's seat), and the letterbox opens.
 *
 * THE PLAYER. play(scene, camera, opts) stages the film's scenery in the
 * scene and returns a handle; its owner calls handle.frame(nowMs) once a
 * rendered frame, after its own camera logic and before the draw, and
 * handle.afterDraw(canvas) after the draw (a dissolve keeps the outgoing
 * shot's last frame from it). It owns no loop. handle.done resolves when
 * it is over, skipped past the briefing, or disposed.
 *
 * CONTENT. The enemy is never named and wears no markings (attackers.js
 * builds them unmarked); no person is shown, harmed or otherwise.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAttackers } from './attackers.js';
import { celMaterial } from './celmat.js';
import { craftBuilderFor } from './craft.js';
import { warVoiceUrl } from './warradio.js';
import { poseAt } from '../share/war/routes.js';
import { createBoard } from './filmboard.js';
import { buildRoom } from './filmroom.js';
import {
  HANDOFF_MS, OUT_S, PRELOAD_MS, blackAt, anchor, boardAt, boardStills, cameraAt, castAt, lensFov, lineAt, linesOf, musicAt, musicCues, placeAgents, scopeAt, shotIndex, spinAt, timing,
} from '../share/war/film.js';
import { filmFor } from '../share/war/films/index.js';
import { INTRO_MS } from '../share/war/intro.js';
import { str, currentLocale } from '../strings/index.js';

export { INTRO_MS };

/* Hold this long to skip a film already seen. */
export const SKIP_HOLD_MS = 2000;
/* The voice's anchor to the picture's clock is set again past this. */
export const ANCHOR_SLIP_MS = 40;
/* A line is scheduled on the audio clock this far ahead of its start. */
const SCHEDULE_AHEAD_MS = 1500;
/* A line joined this close to its end is left: a word's tail is noise. */
const LATE_TAIL_S = 0.25;

const CREST_Y = 225;
const WATER_Y = 219;
const WATER = 'water';
/* The briefing's orbit after a skip: once round the dam in ORBIT_MS. */
const DAM = [59, 212, -1672];
const ORBIT_R = 820;
const ORBIT_Y = 430;
const ORBIT_MS = 150000;

/*
 * Everything drawn under `root` as one draw call: its visible meshes but
 * those under `skip` merged into one geometry in root's frame, each
 * part's colour baked into its vertices, under the one cel material
 * `mat` (the way attackers.js draws a kind); sprites, lines and hidden
 * parts go. The builders' parts are a draw call each, forty for a quad,
 * and the map at Itaipu already spends up to 290 of the 300 a view
 * (ITAIPU-PLAN section 13). Textures are lost, which at a lite build's
 * plain colours is nothing.
 */
function bake(root, mat, skip = []) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const skipped = new Set();
  for (const k of skip) {
    k.traverse((o) => skipped.add(o));
  }
  const shown = (o) => {
    for (let x = o; x && x !== root; x = x.parent) {
      if (!x.visible) {
        return false;
      }
    }
    return true;
  };
  const geos = [];
  const going = [];
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    if (skipped.has(o) || !(o.isMesh || o.isSprite || o.isLine || o.isPoints)) {
      return;
    }
    going.push(o);
    if (!o.isMesh || !shown(o)) {
      return;
    }
    const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', src.attributes.position.clone());
    if (src.attributes.normal) {
      g.setAttribute('normal', src.attributes.normal.clone());
    } else {
      g.computeVertexNormals();
    }
    if (src !== o.geometry) {
      src.dispose();
    }
    g.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
    const material = Array.isArray(o.material) ? o.material[0] : o.material;
    const c = material && material.color ? material.color : new THREE.Color(0x888888);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  });
  /* A skipped part under one that goes moves up to the nearest that
   * stays, where it is. */
  const gone = new Set(going);
  for (const k of skip) {
    let up = k.parent;
    while (gone.has(up)) {
      up = up.parent;
    }
    if (up !== k.parent) {
      up.attach(k);
    }
  }
  for (const o of going) {
    o.parent.remove(o);
  }
  if (!geos.length) {
    return;
  }
  const one = new THREE.Mesh(mergeGeometries(geos, false), mat);
  for (const g of geos) {
    g.dispose();
  }
  one.name = `${root.name || 'part'}-baked`;
  root.add(one);
}

/*
 * An aircraft from the game's builder, baked: one draw call, or with
 * `spins` one more per rotor, each rotor its own call so it can turn. The
 * blur discs go either way: a still one is a blur of nothing, and a
 * turning rotor under the camera's frame rate reads as a real one does on
 * video.
 */
function bakeCraft(holder, built, spins, mat) {
  for (const d of built.discs || []) {
    d.parent.remove(d);
  }
  const rotors = spins ? (built.blades || []) : [];
  for (const r of rotors) {
    bake(r, mat);
  }
  bake(holder, mat, rotors);
}

/* The colour grade over each shot: a CSS filter on the world's canvas and
 * a tint laid over it. */
const GRADES = {
  dawn: { filter: 'contrast(1.12) saturate(0.8) brightness(0.95)', tint: 'linear-gradient(180deg, rgba(255,150,70,0.22), rgba(255,120,60,0.06) 55%, rgba(20,40,70,0.18))' },
  steel: { filter: 'contrast(1.14) saturate(0.62) brightness(0.96)', tint: 'linear-gradient(180deg, rgba(40,70,90,0.18), rgba(30,50,60,0.06) 50%, rgba(10,20,30,0.22))' },
  warm: { filter: 'contrast(1.1) saturate(0.72) brightness(0.97)', tint: 'linear-gradient(180deg, rgba(255,170,90,0.12), rgba(40,60,70,0.12))' },
  /* Warm with a graduated filter over the frame's lower half, as a camera
   * crew would hang one: the crest's pale concrete, under the lens down
   * the line of aircraft, burnt out to white. */
  'warm-grad': { filter: 'contrast(1.1) saturate(0.72) brightness(0.97)', tint: 'linear-gradient(180deg, rgba(255,170,90,0.12), rgba(255,170,90,0.04) 48%, rgba(24,30,36,0.42) 72%, rgba(14,18,22,0.55))' },
  night: { filter: 'contrast(1.18) saturate(0.55) brightness(0.9)', tint: 'linear-gradient(180deg, rgba(20,30,70,0.25), rgba(10,15,40,0.1) 50%, rgba(0,0,10,0.3))' },
  /* The Interior's (INTROS of The Interior, 0.7): the archive's warm
   * paper, the room's cool monitor glow, the camera ball's clean air, and
   * the dusk of the landing. */
  archive: { filter: 'grayscale(0.8) sepia(0.35) contrast(1.12) brightness(0.92)', tint: 'linear-gradient(180deg, rgba(120,90,50,0.12), rgba(60,40,20,0.18))' },
  room: { filter: 'contrast(1.08) saturate(0.85) brightness(0.92)', tint: 'linear-gradient(180deg, rgba(20,40,60,0.18), rgba(10,20,30,0.24))' },
  air: { filter: 'contrast(1.06) saturate(0.9)', tint: 'linear-gradient(180deg, rgba(255,240,220,0.04), rgba(0,0,0,0.08))' },
  dusk: { filter: 'contrast(1.12) saturate(0.7) brightness(0.88)', tint: 'linear-gradient(180deg, rgba(255,140,80,0.16), rgba(60,40,70,0.14) 55%, rgba(10,10,30,0.3))' },
};

const smooth = (u) => u * u * (3 - 2 * u);
/* One turn of the scope's sweep, ms. */
const SCOPE_SWEEP_MS = 4000;

/* A style written only when it changes: the overlay is set every frame,
 * and a write of the same value still costs the page a style pass. */
const written = new WeakMap();
function put(e, prop, v) {
  let w = written.get(e);
  if (!w) {
    w = {};
    written.set(e, w);
  }
  if (w[prop] !== v) {
    w[prop] = v;
    e.style[prop] = v;
  }
}

function el(tag, css, parent, text) {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text != null) {
    e.textContent = text;
  }
  if (parent) {
    parent.appendChild(e);
  }
  return e;
}

const TITLE_FONT = 'Impact, "Oswald", "Bebas Neue", "Arial Narrow", "Helvetica Neue", var(--ui-font, sans-serif)';
/* A 'card' title's type: the camera ball's HUD's, letter spaced. */
const CARD_FONT = ['ui-monospace', '"SFMono-Regular"', 'Menlo', 'Consolas', 'monospace'].join(', ');

/*
 * Play a film. `scene` and `camera` are the shell's; opts:
 *   film         the film (src/share/war/films), the default's without
 *   title        { key, n }: the mission's title's string key and number,
 *                for the preload's card and the film's mission card
 *   clock()      film ms now; without it the film runs from its start on
 *                this screen's own clock (Watch intro)
 *   hold         true in a room's briefing: a skip waits on the orbit
 *                until the film's end, the briefing's
 *   seen         this pilot has seen this film's cut: it may hold to skip
 *   onSeen()     the film's last shot reached on a viewing from its start
 *   onSkip()     this pilot held to skip
 *   canvas       the world's canvas (the grade goes on it), default #view
 *   audio        the shell's MotorAudio, or null
 *   ground(x, z) the ground's height, for cast standing on it
 *   named        [[x, y, z]...]: the targets a shot's `outline` brackets
 *                (the room's working set), none without it
 *   map          the standing world's map id: a film of another map is
 *                refused (the check is skipped without it)
 *   orbit        { centre: [x, y, z], r, y }: the briefing's orbit after a
 *                skip, the dam's without it
 *   board        { map, stills, capture, raster }: what a BOARD shot
 *                draws (src/render/filmboard.js createBoard); a film with
 *                BOARD shots needs it
 */
export function play(scene, camera, opts = {}) {
  const film = opts.film ?? filmFor(null);
  if (opts.map != null && (film.map ?? 'itaipu') !== opts.map) {
    throw new Error(`warintro: film ${film.id} is of the ${film.map ?? 'itaipu'} map, and the world standing is ${opts.map}`);
  }
  const timed = timing(film);
  const agents = placeAgents(film, timed);
  const canvas = opts.canvas || document.getElementById('view');
  const ground = opts.ground || (() => CREST_Y);
  const lang = currentLocale() === 'es' ? 'es' : 'en';
  const audio = opts.audio || null;
  const orbitAt = opts.orbit ?? { centre: DAM, r: ORBIT_R, y: ORBIT_Y };
  const t0Wall = performance.now();
  const clock = opts.clock ?? (() => performance.now() - t0Wall);
  const startT = clock();
  /* Seen counts only a viewing from its first shot (INTROS section 3). */
  const fromStart = startT <= timed.shots[0].start;

  const root = new THREE.Group();
  root.name = 'war-intro';
  scene.add(root);
  /* The attackers only for a film that flies them. */
  const attackers = film.agents?.length ? createAttackers() : null;
  if (attackers) {
    root.add(attackers.group);
  }

  /* The cast, built once, hidden until a shot shows it. */
  const cast = new Map();
  const box = new THREE.Box3();
  const bakedMat = celMaterial({ color: 0xffffff });
  bakedMat.vertexColors = true;
  for (const [name, def] of Object.entries(film.cast ?? {})) {
    /* Lite: the Settings studio's build, the same silhouette with no ink
     * hulls or shadow casters, so eight on the crest cost what one full
     * build does against the 300 call budget. */
    const built = craftBuilderFor(def.airframe)({
      name: `intro-${name}`, fog: true, worldScale: true, lite: true,
    });
    const holder = new THREE.Group();
    holder.add(built.group);
    /* The Bramor on its catapult, or hanging under its open canopy: shown
     * before the bake, which keeps only what is shown. */
    if (def.launcher && built.launcher) {
      built.launcher.visible = true;
    }
    if (def.chute && built.setChute) {
      built.setChute(1, [0, 1, 0], [0, -1, 0]);
    }
    /* Stand it on its lowest point: the builders' origin is the CG. */
    built.group.updateMatrixWorld(true);
    box.setFromObject(built.group);
    built.group.position.y = -box.min.y;
    bakeCraft(holder, built, Boolean(def.spins), bakedMat);
    holder.visible = false;
    root.add(holder);
    cast.set(name, {
      holder, built, base: (built.blades || []).map((b) => b.rotation.y),
    });
  }
  const who = (name, def) => cast.get(def && def.as ? def.as : name);

  /* The sets the film's shots stand in (the operations room), built once,
   * shown only in their own shots. */
  const sets = new Map();
  for (const [name, def] of Object.entries(film.sets ?? {})) {
    const built = buildRoom();
    const [x, y, z] = def.at;
    built.group.position.set(x, def.agl ? y + ground(x, z) : y, z);
    built.group.visible = false;
    root.add(built.group);
    sets.set(name, built);
  }
  /* The BOARD's drawer, for a film with BOARD shots or a set's screens. */
  const needsBoard = film.shots.some((s) => s.board);
  if (needsBoard && !opts.board) {
    throw new Error(`warintro: film ${film.id} has BOARD shots and no opts.board`);
  }
  const board = needsBoard ? createBoard(opts.board) : null;
  let boardShown = [];
  /* Every still the film shows, painted one a frame in the preload's
   * black: a still painted on its first frame on screen is a hitch. */
  const warming = needsBoard ? [...new Set([...film.shots.flatMap((s) => boardStills(s)), ...Object.values(film.sets ?? {}).map((x) => x.feed).filter(Boolean)])] : [];

  /* ------------------------------------------------------- the overlay */
  const overlay = el('div', 'position:fixed;inset:0;z-index:9000;pointer-events:none;overflow:hidden;'
    + 'font-family:var(--ui-font, sans-serif);color:#f1ece0;', document.body);
  overlay.dataset.warIntro = '1';
  /* The shell's own screens and HUDs are the body's other children: out
   * of sight while the film runs, back as they were after. */
  const hide = el('style', '', document.head, 'body.war-intro > :not(#view):not([data-war-intro]) { visibility: hidden !important; }');
  hide.dataset.warIntro = '1';
  document.body.classList.add('war-intro');
  const tint = el('div', 'position:absolute;inset:0;', overlay);
  /* The outgoing shot's last frame, fading over the next: a dissolve. */
  const dissolve = el('canvas', 'position:absolute;inset:0;width:100%;height:100%;opacity:0;', overlay);
  /* The 2D inserts: the SCOPE over the whole frame, a shot's outlines. */
  const insert = el('canvas', 'position:absolute;inset:0;width:100%;height:100%;', overlay);
  const ink = insert.getContext('2d');
  let inked = false;
  el('div', 'position:absolute;inset:0;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%);', overlay);
  /* The 2.39 letterbox, opened by the hand-off: a scale on each bar. */
  const BAR = 'max(0px, calc((100vh - 100vw / 2.39) / 2))';
  const barCss = `position:absolute;left:0;right:0;height:${BAR};background:#000;will-change:transform;`;
  const barTop = el('div', `${barCss}top:0;transform-origin:top;`, overlay);
  const barBottom = el('div', `${barCss}bottom:0;transform-origin:bottom;`, overlay);
  /* The layers that fade are their own compositor layers, so a fade is
   * an opacity on the GPU and not a repaint. */
  const black = el('div', 'position:absolute;inset:0;background:#000;opacity:1;will-change:opacity;', overlay);
  const titleBox = el('div', 'position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;opacity:0;will-change:opacity;', overlay);
  const titleMain = el('div', `font-family:${TITLE_FONT};font-weight:900;text-transform:uppercase;line-height:0.95;`
    + 'text-shadow:0 0 24px rgba(0,0,0,0.55);', titleBox);
  const titleSub = el('div', `font-family:${TITLE_FONT};font-weight:700;text-transform:uppercase;letter-spacing:0.5em;`
    + 'font-size:clamp(14px, 2.2vw, 30px);margin-top:0.8em;color:#d9b36a;', titleBox);
  const credit = el('div', `position:absolute;right:4vw;bottom:calc(${BAR} + 1.2em);`
    + 'font-size:clamp(9px, 0.9vw, 12px);opacity:0;color:#cfc9bb;letter-spacing:0.04em;', overlay);
  const sub = el('div', `position:absolute;left:8vw;right:8vw;bottom:calc(${BAR} + 3.2em);`
    + 'text-align:center;font-size:clamp(15px, 1.7vw, 26px);font-weight:600;line-height:1.35;'
    + 'text-shadow:0 1px 3px #000, 0 0 12px rgba(0,0,0,0.8);opacity:0;', overlay);
  const counter = el('div', `position:absolute;left:5vw;top:calc(${BAR} + 2.4em);`
    + 'font-family:ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;letter-spacing:0.08em;opacity:0;', overlay);
  el('div', 'font-size:clamp(11px, 1vw, 14px);color:#9fd8a8;text-transform:uppercase;', counter, str('war.output'));
  const counterValue = el('div', 'font-size:clamp(24px, 3vw, 44px);font-weight:800;color:#e9f5e6;', counter);
  const counterUnits = el('div', 'display:flex;gap:3px;margin-top:6px;', counter);
  const units = Array.from({ length: 20 }, () => el('div', 'width:9px;height:14px;background:#9fd8a8;opacity:0.15;', counterUnits));
  const hold = el('div', `position:absolute;left:0;right:0;bottom:calc(${BAR} + 2em);`
    + 'text-align:center;font-size:clamp(14px, 1.4vw, 20px);font-weight:700;letter-spacing:0.12em;text-transform:uppercase;'
    + 'color:#d9b36a;text-shadow:0 1px 3px #000;display:none;', overlay);
  /* Hold to skip: a hint and a ring, subtle, only on a film seen. */
  const skipBox = el('div', `position:absolute;right:3vw;top:calc(${BAR} + 1em);display:${opts.seen ? 'flex' : 'none'};align-items:center;gap:8px;`
    + 'font-size:clamp(10px, 0.9vw, 12px);letter-spacing:0.1em;text-transform:uppercase;opacity:0.5;', overlay);
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 20 20');
  ring.setAttribute('width', '18');
  ring.setAttribute('height', '18');
  ring.innerHTML = '<circle cx="10" cy="10" r="8" fill="none" stroke="rgba(241,236,224,0.25)" stroke-width="2"/>'
    + '<circle cx="10" cy="10" r="8" fill="none" stroke="#f1ece0" stroke-width="2" stroke-dasharray="50.27" stroke-dashoffset="50.27" transform="rotate(-90 10 10)"/>';
  skipBox.appendChild(ring);
  const ringArc = ring.lastChild;
  el('span', '', skipBox, str('war.intro.skip'));
  const canvasFilter = canvas.style.filter;

  /* ------------------------------------------------------- the sound */
  const radio = audio && audio.ctx ? audio.war() : null;
  if (radio) {
    radio.setLang(lang);
  }
  const ctx = radio && radio.filmVoice ? audio.ctx : null;
  const bedWas = radio ? radio.track : '';
  let bedSet = false;
  /* line id -> AudioBuffer, decoded at the start; and each line's state. */
  const buffers = new Map();
  const filmLines = linesOf(timed);
  const scheduled = new Map();
  const cued = [];
  let anchorS = null;
  let lines = null;
  const text = fetch(new URL('../../assets/audio/war/lines.json', import.meta.url).href).then((r) => r.json()).then((j) => {
    lines = Object.fromEntries(j.lines.map((l) => [l.id, l[lang] || l.en]));
  });
  text.catch((e) => console.warn(`warintro: no subtitles: ${e.message}`));
  if (ctx) {
    for (const id of new Set(filmLines.map((l) => l.line))) {
      fetch(warVoiceUrl(lang, id, radio.ext)).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => {
        buffers.set(id, buf);
      }).catch((e) => console.warn(`warintro: ${id} not decoded: ${e.message}`));
    }
  }

  /* ------------------------------------------------------- the clock */
  let skipped = false;
  let ended = false;
  let seenTold = false;
  let finished;
  const done = new Promise((resolve) => {
    finished = resolve;
  });
  const frames = timed.shots.map(() => 0);
  let held = null;
  let state = { t: startT, shot: -1, orbit: false, done: false };
  /* How far the hand-off has opened the letterbox, 0 to 1. */
  let opened = 0;
  /* The last frame of a shot ending on a dissolve, kept by afterDraw. */
  let dissolveFor = -1;
  const shellPos = new THREE.Vector3();
  const shellQuat = new THREE.Quaternion();
  const filmQuat = new THREE.Quaternion();
  const look = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  /* Any key, button or tap held SKIP_HOLD_MS skips a film already seen;
   * nothing skips a first viewing. Every input is the film's while it
   * runs, so a held key flies nothing. */
  function onDown(ev) {
    if (ended || skipped || state.orbit) {
      return;
    }
    if (ev.type === 'keydown' && (ev.repeat || ['Shift', 'Control', 'Alt', 'Meta'].includes(ev.key))) {
      ev.preventDefault();
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    if (opts.seen && held == null) {
      held = performance.now();
    }
  }
  function onUp() {
    held = null;
    ringArc.setAttribute('stroke-dashoffset', '50.27');
  }
  window.addEventListener('keydown', onDown, true);
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('keyup', onUp, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('blur', onUp);

  function holdFrame(nowWall) {
    if (held == null) {
      return;
    }
    const u = Math.min(1, (nowWall - held) / SKIP_HOLD_MS);
    ringArc.setAttribute('stroke-dashoffset', (50.27 * (1 - u)).toFixed(2));
    if (u >= 1) {
      held = null;
      skipped = true;
      if (opts.onSkip) {
        opts.onSkip();
      }
    }
  }

  /* A cast member at shot ms t, shown and posed. */
  function place(name, def, s, t, shown) {
    const c = who(name, def);
    const at = castAt(def, s, t);
    if (!at.shown) {
      c.holder.visible = false;
      return;
    }
    c.holder.visible = true;
    const [x, y, z] = at.p;
    c.holder.position.set(x, y === WATER ? WATER_Y : y == null ? ground(x, z) : def.agl ? y + ground(x, z) : y, z);
    if (def.bob) {
      c.holder.position.y += def.bob * Math.sin((t / 1000) * 5.2);
    }
    euler.set(at.pitch, at.yaw, at.roll);
    c.holder.quaternion.setFromEuler(euler);
    const spin = spinAt(def, s, t);
    const { blades, propSpin } = c.built;
    for (let m = 0; blades && m < blades.length; m += 1) {
      blades[m].rotation.y = c.base[m] + spin * (propSpin ? propSpin[m] : 1);
    }
    shown.add(c);
  }

  /* Where things are at shot ms t, for the camera's targets: a cast
   * member from its keys (a drone camera asks where it was a lag ago), a
   * group's middle from its plan. */
  const resolveFor = (s) => ({
    cast: (name, t) => {
      const def = s.cast?.[name];
      const c = def ? who(name, def) : null;
      if (!c) {
        throw new Error(`warintro: ${s.id} follows no cast member ${name}`);
      }
      const at = castAt(def, s, Math.max(0, t));
      if (!at.shown) {
        return [c.holder.position.x, c.holder.position.y, c.holder.position.z];
      }
      const [x, y, z] = at.p;
      return [x, y === WATER ? WATER_Y : y == null ? ground(x, z) : def.agl ? y + ground(x, z) : y, z];
    },
    ground: (x, z) => ground(x, z),
    agent: (id, t, k) => {
      const a = (k != null ? agents.find((x) => x.group === id && x.a.k === k) : null)
        ?? agents.find((x) => x.group === id && x.pass) ?? agents.find((x) => x.group === id);
      /* Before its birth, where it will be born. */
      return poseAt(a.plan, Math.max(a.plan.t0, s.start + t)).p;
    },
  });

  function overlays(s, i, t, tFilm) {
    const g = GRADES[s.grade] || GRADES.steel;
    put(canvas, 'filter', g.filter);
    put(tint, 'background', g.tint);
    put(black, 'opacity', String(Math.max(0, Math.min(1, blackAt(timed, i, t)))));
    /* A dissolve from the shot before: its last frame, fading. */
    const prev = timed.shots[i - 1];
    const dMs = prev && prev.out === 'dissolve' ? (prev.outS ?? OUT_S) * 1000 : 0;
    put(dissolve, 'opacity', dMs > 0 && t < dMs ? (1 - t / dMs).toFixed(3) : '0');
    /* Titles. */
    let title = null;
    for (const x of s.titles || []) {
      if (x.kind !== 'credit' && t >= anchor(x.from, s) && t < anchor(x.to, s)) {
        title = x;
      }
    }
    titleShown(title ? {
      ...titleText(title), from: anchor(title.from, s), to: anchor(title.to, s), kind: title.kind,
    } : null, t);
    const cr = (s.titles || []).find((x) => x.kind === 'credit' && t >= anchor(x.from, s) && t < anchor(x.to, s));
    put(credit, 'opacity', cr ? String(Math.min(0.8, (t - anchor(cr.from, s)) / 800, (anchor(cr.to, s) - t) / 600)) : '0');
    if (cr && credit.textContent !== str(cr.key)) {
      credit.textContent = str(cr.key);
    }
    /* The output counter. */
    if (s.counter) {
      const from = anchor(s.counter.from, s);
      const to = anchor(s.counter.to, s);
      const u = Math.max(0, Math.min(1, (t - from) / Math.max(1, to - from)));
      const lit = Math.round(20 * smooth(u));
      put(counter, 'opacity', String(Math.min(1, Math.max(0, (t - from + 400) / 400), (s.ms - t) / 500)));
      const shown = str('war.output_mw', { mw: (lit * 700).toLocaleString(lang === 'es' ? 'es' : 'en').replace(/[.,]/g, ' ') });
      if (counterValue.textContent !== shown) {
        counterValue.textContent = shown;
      }
      for (let k = 0; k < 20; k += 1) {
        put(units[k], 'opacity', k < lit ? '1' : '0.15');
      }
    } else {
      put(counter, 'opacity', '0');
    }
    drawInsert(s, t, tFilm);
    subtitle(tFilm);
  }

  /* The insert canvas: the scope, the BOARD, the outlines, the camera
   * ball's picture, or nothing (cleared once). */
  function drawInsert(s, t, tFilm) {
    const outlining = s.outline && opts.named && opts.named.length
      && t >= anchor(s.outline.from ?? 0, s) && t < anchor(s.outline.to ?? { at: 'end' }, s);
    const boarding = Boolean(s.board) && s.camera.type === 'board';
    if (!s.scope && !outlining && !boarding && !s.ball) {
      if (inked) {
        ink.clearRect(0, 0, insert.width, insert.height);
        inked = false;
      }
      state.scope = null;
      state.outlined = 0;
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(insert.clientWidth * dpr);
    const h = Math.round(insert.clientHeight * dpr);
    if (insert.width !== w || insert.height !== h) {
      insert.width = w;
      insert.height = h;
    }
    ink.clearRect(0, 0, w, h);
    inked = true;
    if (s.scope) {
      drawScope(s, t, tFilm, w, h, dpr);
    } else if (boarding) {
      drawBoardFull(s, t, tFilm, w, h, dpr);
    } else if (outlining) {
      drawOutlines(w, h, dpr, t);
    }
    if (s.ball) {
      drawBall(s, t, w, h, dpr);
    }
  }

  /* The BOARD over the whole frame: the room's screen, 16:9, in its bezel
   * inside the 2.39 frame the letterbox leaves. */
  function drawBoardFull(s, t, tFilm, w, h, dpr) {
    const frameH = Math.min(h, w / 2.39);
    let rh = frameH * 0.94;
    let rw = (rh * 16) / 9;
    if (rw > w * 0.96) {
      rw = w * 0.96;
      rh = (rw * 9) / 16;
    }
    const x0 = Math.round((w - rw) / 2);
    const y0 = Math.round((h - rh) / 2);
    ink.fillStyle = '#000';
    ink.fillRect(0, 0, w, h);
    ink.fillStyle = '#0d0f11';
    ink.fillRect(x0 - 6 * dpr, y0 - 6 * dpr, rw + 12 * dpr, rh + 12 * dpr);
    ink.save();
    ink.translate(x0, y0);
    ink.beginPath();
    ink.rect(0, 0, rw, rh);
    ink.clip();
    boardShown = board.draw(ink, Math.round(rw), Math.round(rh), boardAt(s, t), tFilm, dpr);
    ink.restore();
  }

  /* The set's screens: the BOARD on the big one and the first monitor,
   * the camera ball's feed and the telemetry on the other two. */
  function drawSetScreens(built, def, s, t, tFilm) {
    const state = s.board ? boardAt(s, t) : { black: false, view: null, layers: [], marks: [], stills: [] };
    for (const sc of built.screens) {
      const g = sc.canvas.getContext('2d');
      const { width: cw, height: ch } = sc.canvas;
      if (sc.role === 'board') {
        boardShown = board.draw(g, cw, ch, state, tFilm, cw / 1024);
      } else if (sc.role === 'feed') {
        /* The set's feed still, panning slowly as a camera ball does. */
        g.fillStyle = '#10140f';
        g.fillRect(0, 0, cw, ch);
        const src = def.feed ? board.source(def.feed) : null;
        if (src && src.image) {
          const pan = Math.sin(tFilm / 9000) * 0.06;
          g.drawImage(src.image, (pan - 0.08) * cw, -0.08 * ch, cw * 1.16, ch * 1.16);
        }
      } else {
        g.fillStyle = '#071012';
        g.fillRect(0, 0, cw, ch);
        g.fillStyle = 'rgba(127, 208, 168, 0.45)';
        g.font = `600 ${Math.round(ch / 14)}px ${CARD_FONT}`;
        for (let k = 0; k < 9; k += 1) {
          const bar = 0.2 + 0.6 * (((k * 97 + Math.floor(tFilm / 700)) % 13) / 13);
          g.fillRect(cw * 0.08, ch * (0.1 + k * 0.09), cw * 0.5 * bar, ch * 0.025);
        }
      }
      sc.texture.needsUpdate = true;
    }
  }

  /* The camera ball's picture over a world shot: noise until it is on,
   * then its quiet marks drawing in (the Interior's quiet HUD, N7, in the
   * film's own hand: no coordinates, no place name). */
  function drawBall(s, t, w, h, dpr) {
    const on = s.ball.on != null ? anchor(s.ball.on, s) : 0;
    const hud = s.ball.hud != null ? anchor(s.ball.hud, s) : 0;
    const frameH = Math.min(h, w / 2.39);
    const top = (h - frameH) / 2;
    const noiseA = t < on ? 1 : Math.max(0, 1 - (t - on) / 500);
    if (noiseA > 0) {
      ink.globalAlpha = noiseA;
      ink.fillStyle = '#202322';
      ink.fillRect(0, top, w, frameH);
      for (let k = 0; k < 900; k += 1) {
        const v = (Math.imul(k + Math.floor(t / 40) * 977, 2654435761) >>> 0) / 4294967296;
        const g = Math.round(40 + v * 160);
        ink.fillStyle = `rgb(${g},${g},${g})`;
        ink.fillRect(((k * 7919) % 1000) / 1000 * w, top + (((k * 104729 + Math.floor(t / 40) * 31) % 1000) / 1000) * frameH, 3 * dpr, 2 * dpr);
      }
      ink.globalAlpha = 1;
    }
    const a = Math.max(0, Math.min(1, (t - hud) / 800));
    if (a <= 0) {
      return;
    }
    ink.globalAlpha = a * 0.85;
    ink.strokeStyle = '#d8f0e2';
    ink.fillStyle = '#d8f0e2';
    ink.lineWidth = 1.5 * dpr;
    const m = frameH * 0.08;
    const leg = frameH * 0.06;
    for (const [x, y, sx, sy] of [[m, top + m, 1, 1], [w - m, top + m, -1, 1], [w - m, top + frameH - m, -1, -1], [m, top + frameH - m, 1, -1]]) {
      ink.beginPath();
      ink.moveTo(x, y + sy * leg);
      ink.lineTo(x, y);
      ink.lineTo(x + sx * leg, y);
      ink.stroke();
    }
    const cx = w / 2;
    const cy = top + frameH / 2;
    const r = frameH * 0.035;
    ink.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ink.moveTo(cx + dx * r, cy + dy * r);
      ink.lineTo(cx + dx * r * 2.4, cy + dy * r * 2.4);
    }
    ink.stroke();
    camera.getWorldDirection(tmp);
    const az = (((Math.atan2(tmp.x, -tmp.z) * 180) / Math.PI) + 360) % 360;
    const el = (Math.asin(Math.max(-1, Math.min(1, tmp.y))) * 180) / Math.PI;
    const size = Math.round(Math.max(10, frameH / 38));
    ink.font = `600 ${size}px ${CARD_FONT}`;
    ink.textBaseline = 'top';
    ink.textAlign = 'left';
    ink.fillText(str('interior.film.ball_eo'), m + leg * 0.4, top + m + leg * 0.4);
    ink.textAlign = 'right';
    if (Math.floor(t / 600) % 2 === 0) {
      ink.fillText(str('interior.film.ball_rec'), w - m - leg * 0.4, top + m + leg * 0.4);
    }
    ink.textAlign = 'center';
    ink.textBaseline = 'bottom';
    ink.fillText(str('interior.film.ball_gimbal', { az: String(Math.round(az)).padStart(3, '0'), el: Math.round(el) }), cx, top + frameH - m - leg * 0.4);
    ink.globalAlpha = 1;
  }

  function drawScope(s, t, tFilm, w, h, dpr) {
    const sc = s.scope;
    /* Inside the 2.39 frame the letterbox leaves, clear of the subtitle. */
    const frameH = Math.min(h, w / 2.39);
    const R = frameH * 0.4;
    const cx = w / 2;
    const cy = h / 2 - frameH * 0.06;
    const px = (u, v) => [cx + u * R, cy + v * R];
    ink.fillStyle = '#020a07';
    ink.fillRect(0, 0, w, h);
    ink.save();
    ink.beginPath();
    ink.arc(cx, cy, R, 0, 2 * Math.PI);
    ink.fillStyle = '#04170f';
    ink.fill();
    ink.clip();
    ink.lineWidth = 1 * dpr;
    ink.strokeStyle = 'rgba(80, 200, 140, 0.25)';
    for (const k of [1 / 3, 2 / 3]) {
      ink.beginPath();
      ink.arc(cx, cy, R * k, 0, 2 * Math.PI);
      ink.stroke();
    }
    ink.beginPath();
    ink.moveTo(cx - R, cy);
    ink.lineTo(cx + R, cy);
    ink.moveTo(cx, cy - R);
    ink.lineTo(cx, cy + R);
    ink.stroke();
    /* The landmarks, then the sweep, then the contacts over both. */
    ink.lineWidth = 2.5 * dpr;
    ink.strokeStyle = 'rgba(90, 210, 150, 0.7)';
    for (const line of sc.lines ?? []) {
      ink.beginPath();
      line.forEach(([x, z], k) => {
        const [qx, qy] = px((x - sc.at[0]) / sc.r, (z - sc.at[1]) / sc.r);
        if (k === 0) {
          ink.moveTo(qx, qy);
        } else {
          ink.lineTo(qx, qy);
        }
      });
      ink.stroke();
    }
    ink.font = `600 ${Math.round(11 * dpr)}px ui-monospace, Menlo, Consolas, monospace`;
    ink.fillStyle = 'rgba(110, 230, 170, 0.75)';
    ink.textAlign = 'center';
    for (const m of sc.marks ?? []) {
      const [qx, qy] = px((m.at[0] - sc.at[0]) / sc.r, (m.at[1] - sc.at[1]) / sc.r);
      ink.fillText(str(m.key).toUpperCase(), qx, qy);
    }
    const sweep = ((tFilm / SCOPE_SWEEP_MS) % 1) * 2 * Math.PI - Math.PI / 2;
    ink.beginPath();
    ink.moveTo(cx, cy);
    ink.arc(cx, cy, R, sweep - 0.5, sweep);
    ink.closePath();
    ink.fillStyle = 'rgba(80, 220, 150, 0.12)';
    ink.fill();
    const contacts = scopeAt(s, t, agents, tFilm).filter((c) => c.shown);
    for (const c of contacts) {
      ink.fillStyle = 'rgba(255, 211, 77, 0.35)';
      for (const [u, v] of c.trail) {
        const [qx, qy] = px(u, v);
        ink.fillRect(qx - 1.5 * dpr, qy - 1.5 * dpr, 3 * dpr, 3 * dpr);
      }
      const [qx, qy] = px(c.u, c.v);
      ink.fillStyle = '#ffd34d';
      ink.beginPath();
      ink.moveTo(qx, qy - 5 * dpr);
      ink.lineTo(qx + 5 * dpr, qy);
      ink.lineTo(qx, qy + 5 * dpr);
      ink.lineTo(qx - 5 * dpr, qy);
      ink.closePath();
      ink.fill();
    }
    ink.restore();
    ink.lineWidth = 2 * dpr;
    ink.strokeStyle = 'rgba(90, 210, 150, 0.8)';
    ink.beginPath();
    ink.arc(cx, cy, R, 0, 2 * Math.PI);
    ink.stroke();
    ink.textAlign = 'left';
    ink.fillStyle = 'rgba(110, 230, 170, 0.9)';
    ink.fillText(str('war.scope.title'), cx - R * 1.9, cy - R * 0.85);
    state.scope = { contacts: contacts.length, onScope: contacts.filter((c) => Math.hypot(c.u, c.v) <= 1).length };
  }

  /* Corner brackets round each named target in front of the camera. */
  function drawOutlines(w, h, dpr, t) {
    camera.updateMatrixWorld();
    const a = 14 * dpr;
    const leg = 7 * dpr;
    ink.lineWidth = 2 * dpr;
    ink.strokeStyle = `rgba(255, 224, 64, ${(0.75 + 0.25 * Math.sin(t / 160)).toFixed(3)})`;
    let drawn = 0;
    for (const p of opts.named) {
      const v = projected.set(p[0], p[1], p[2]).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) {
        continue;
      }
      const x = ((v.x + 1) / 2) * w;
      const y = ((1 - v.y) / 2) * h;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ink.beginPath();
        ink.moveTo(x + sx * a, y + sy * (a - leg));
        ink.lineTo(x + sx * a, y + sy * a);
        ink.lineTo(x + sx * (a - leg), y + sy * a);
        ink.stroke();
      }
      drawn += 1;
    }
    state.outlined = drawn;
  }

  /* A title's words: its text, its key, or the mission's own card. */
  function titleText(x) {
    if (x.mission) {
      return { main: opts.title ? str(opts.title.key) : '', sub: opts.title ? str('war.intro.mission', { n: opts.title.n }) : '' };
    }
    return { main: x.text ?? str(x.key), sub: x.sub ? str(x.sub) : '' };
  }

  function titleShown(title, t) {
    if (!title) {
      put(titleBox, 'opacity', '0');
      return;
    }
    const inU = Math.min(1, (t - title.from) / 700);
    const outU = Math.min(1, (title.to - t) / 600);
    put(titleBox, 'opacity', smooth(Math.max(0, Math.min(inU, outU))).toFixed(3));
    if (titleMain.textContent !== title.main) {
      titleMain.textContent = title.main;
    }
    const year = title.kind === 'year';
    const card = title.kind === 'card';
    put(titleMain, 'fontFamily', card ? CARD_FONT : TITLE_FONT);
    put(titleMain, 'fontWeight', card ? '500' : '900');
    put(titleMain, 'fontSize', year ? 'clamp(64px, 13vw, 220px)' : card ? 'clamp(24px, 3.6vw, 60px)' : 'clamp(40px, 7.5vw, 130px)');
    put(titleMain, 'letterSpacing', `${year ? 0.08 : card ? 0.6 : 0.04}em`);
    /* The title settles from wide to its tracking as it fades in: a
     * transform, so the text is laid out and painted once. */
    put(titleMain, 'transform', `scaleX(${(1 + (1 - smooth(Math.max(0, inU))) * 0.12).toFixed(3)})`);
    if (titleSub.textContent !== title.sub) {
      titleSub.textContent = title.sub;
    }
  }

  /* The line under way in the page's language, for its own length. */
  function subtitle(tFilm) {
    const l = lineAt(timed, tFilm, lang);
    const line = l && lines ? lines[l.line] : null;
    put(sub, 'opacity', line ? '1' : '0');
    if (line && sub.textContent !== line) {
      sub.textContent = line;
    }
  }

  /*
   * The voice on the audio clock: one anchor, film ms 0 at anchorS on the
   * context's clock, set again when the picture's clock and it part by
   * ANCHOR_SLIP_MS (the lines not yet playing go with it). Each line is
   * scheduled SCHEDULE_AHEAD_MS ahead of its start, or from its offset
   * when it is already under way, never dropped while there is more than
   * LATE_TAIL_S of it left.
   */
  function sounds(tFilm) {
    if (!ctx) {
      return;
    }
    const lead = ctx.outputLatency || ctx.baseLatency || 0;
    const want = ctx.currentTime + lead - tFilm / 1000;
    if (anchorS == null || Math.abs(want - anchorS) * 1000 > ANCHOR_SLIP_MS) {
      anchorS = want;
      for (const [id, x] of scheduled) {
        if (x.src && x.when > ctx.currentTime) {
          x.src.stop();
          scheduled.delete(id);
          const k = cued.findIndex((c) => c.at === id);
          if (k >= 0) {
            cued.splice(k, 1);
          }
        }
      }
    }
    for (const l of filmLines) {
      if (scheduled.has(l.start) || tFilm < l.start - SCHEDULE_AHEAD_MS) {
        continue;
      }
      const buf = buffers.get(l.line);
      if (!buf) {
        continue;
      }
      const when = anchorS + l.start / 1000;
      const offset = Math.max(0, ctx.currentTime - when);
      if (offset > buf.duration - LATE_TAIL_S) {
        scheduled.set(l.start, { when, src: null, late: true });
        continue;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(radio.filmVoice);
      if (offset > 0) {
        src.start(ctx.currentTime, offset);
      } else {
        src.start(when);
      }
      scheduled.set(l.start, { when, src, offset });
      cued.push({
        line: l.line, at: l.start, offset: Math.round(offset * 1000), decoded: Math.round(buf.duration * 1000),
      });
    }
  }

  /* The music: the cue under way (film.js musicCues; a war film's is the
   * intro from the first shot), from where the film is in it, set once a
   * cue. */
  const cues = musicCues(film, timed);
  let cueOn = -1;
  function music(tFilm) {
    if (!radio) {
      return;
    }
    const k = musicAt(cues, tFilm);
    if (k < 0 || k === cueOn) {
      return;
    }
    cueOn = k;
    bedSet = true;
    audio.setWarBed(cues[k].track, (tFilm - cues[k].at) / 1000);
  }

  /* The bed as the film found it, but in a room's briefing: there the
   * intro's music runs on under the countdown into the fight's loop
   * (INTROS section 4: no silence between the film and the first stage). */
  function bedBack() {
    if (bedSet && !opts.hold) {
      bedSet = false;
      audio.setWarBed(bedWas);
    }
  }

  function stopVoice() {
    for (const x of scheduled.values()) {
      if (x.src) {
        try {
          x.src.stop();
        } catch {
          /* A source that never started has nothing to stop. */
        }
      }
    }
    scheduled.clear();
  }

  function orbit(nowWall, tFilm) {
    const a = ((nowWall % ORBIT_MS) / ORBIT_MS) * Math.PI * 2;
    const c = orbitAt.centre;
    camera.position.set(c[0] + orbitAt.r * Math.sin(a), orbitAt.y, c[2] + orbitAt.r * Math.cos(a));
    camera.up.set(0, 1, 0);
    camera.lookAt(tmp.set(c[0], c[1], c[2]));
    if (camera.fov !== 50) {
      camera.fov = 50;
      camera.updateProjectionMatrix();
    }
    const left = Math.max(0, Math.ceil((timed.ms - tFilm) / 1000));
    const msg = str('war.intro.briefing', { s: left });
    if (hold.textContent !== msg) {
      hold.textContent = msg;
    }
  }

  /* Out of the film: into the briefing's orbit, or over. */
  function leaveFilm(tFilm) {
    stopVoice();
    if (attackers) {
      attackers.clear();
    }
    for (const c of cast.values()) {
      c.holder.visible = false;
    }
    for (const x of sets.values()) {
      x.group.visible = false;
    }
    canvas.style.filter = canvasFilter;
    titleBox.style.opacity = '0';
    sub.style.opacity = '0';
    counter.style.opacity = '0';
    credit.style.opacity = '0';
    black.style.opacity = '0';
    dissolve.style.opacity = '0';
    ink.clearRect(0, 0, insert.width, insert.height);
    inked = false;
    tint.style.background = 'none';
    skipBox.style.display = 'none';
    if (opts.hold && tFilm < timed.ms) {
      state.orbit = true;
      hold.style.display = 'block';
      return;
    }
    finish();
  }

  function finish() {
    if (ended) {
      return;
    }
    bedBack();
    ended = true;
    state.done = true;
    finished();
  }

  /* The preload: black, and the mission's title over it. */
  function preload(tFilm) {
    put(black, 'opacity', '1');
    /* From the start of the black, which a room's film starts after when
     * the world is rebuilt for it (edge/rooms/war.js WORLD_LEAD_MS). */
    titleShown(opts.title ? {
      main: str(opts.title.key), sub: str('war.intro.mission', { n: opts.title.n }), from: Math.min(0, startT), to: PRELOAD_MS, kind: 'mission',
    } : null, tFilm);
    /* The first shot's camera, so the world draws its first frame there
     * under the black. */
    const s = timed.shots[0];
    const cam = cameraAt(s, 0, resolveFor(s), 0);
    camera.position.set(...cam.p);
    camera.lookAt(look.set(...cam.look));
  }

  const handle = {
    done,

    /* Once a rendered frame, after the shell's camera and before its draw.
     * nowMs is performance.now(). */
    frame(nowMs) {
      if (ended) {
        return;
      }
      const tFilm = clock();
      if (state.orbit) {
        if (tFilm >= timed.ms) {
          finish();
          return;
        }
        orbit(nowMs, tFilm);
        return;
      }
      holdFrame(nowMs);
      if (skipped || tFilm >= timed.ms) {
        leaveFilm(tFilm);
        if (state.orbit) {
          orbit(nowMs, tFilm);
        }
        return;
      }
      sounds(tFilm);
      music(tFilm);
      if (warming.length) {
        board.source(warming.shift());
      }
      const i = shotIndex(timed, tFilm);
      state = { ...state, t: tFilm, shot: i };
      if (i < 0) {
        preload(tFilm);
        return;
      }
      const s = timed.shots[i];
      const t = tFilm - s.start;
      frames[i] += 1;
      if (i === timed.shots.length - 1 && fromStart && !seenTold) {
        seenTold = true;
        if (opts.onSeen) {
          opts.onSeen();
        }
      }
      /* The shell's camera as its own chain left it: the hand-off's end. */
      shellPos.copy(camera.position);
      shellQuat.copy(camera.quaternion);
      const shellFov = camera.fov;
      /* The cast first: a camera may follow one of them. */
      const shown = new Set();
      for (const [name, def] of Object.entries(s.cast || {})) {
        place(name, def, s, t, shown);
      }
      for (const c of cast.values()) {
        if (!shown.has(c)) {
          c.holder.visible = false;
        }
      }
      for (const [name, x] of sets) {
        x.group.visible = s.set === name;
        if (x.group.visible) {
          drawSetScreens(x, film.sets[name], s, t, tFilm);
        }
      }
      const list = [];
      for (const a of agents) {
        if ((a.shots && !a.shots.has(s.id)) || tFilm < a.plan.t0 || tFilm > a.plan.tEnd) {
          continue;
        }
        const pose = poseAt(a.plan, tFilm);
        list.push({
          id: a.a.id, kind: a.a.kind, p: pose.p.slice(), q: pose.q.slice(),
        });
      }
      if (attackers) {
        attackers.update(list, 1 / 60);
      }
      const cam = cameraAt(s, t, resolveFor(s), i);
      camera.position.set(...cam.p);
      camera.up.set(0, 1, 0);
      camera.lookAt(look.set(...cam.look));
      let fov = lensFov(cam.lens, camera.aspect);
      /* The hand-off: the last HANDOFF_MS blend into the shell's camera,
       * the letterbox opening with it. */
      let open = 0;
      if (s.out === 'handoff' && t > s.ms - HANDOFF_MS) {
        open = smooth(Math.min(1, (t - (s.ms - HANDOFF_MS)) / HANDOFF_MS));
        filmQuat.copy(camera.quaternion);
        camera.position.lerp(shellPos, open);
        camera.quaternion.slerpQuaternions(filmQuat, shellQuat, open);
        fov += (shellFov - fov) * open;
      }
      opened = open;
      put(barTop, 'transform', `scaleY(${(1 - open).toFixed(3)})`);
      put(barBottom, 'transform', `scaleY(${(1 - open).toFixed(3)})`);
      if (Math.abs(camera.fov - fov) > 1e-6) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      dissolveFor = s.out === 'dissolve' && t > s.ms - 100 ? i : -1;
      overlays(s, i, t, tFilm);
    },

    /* After the shell's draw: the frame kept for a dissolve. */
    afterDraw(drawn) {
      if (dissolveFor < 0 || !drawn) {
        return;
      }
      if (dissolve.width !== drawn.width || dissolve.height !== drawn.height) {
        dissolve.width = drawn.width;
        dissolve.height = drawn.height;
      }
      dissolve.getContext('2d').drawImage(drawn, 0, 0);
    },

    /* What the checks read: where the film is, the frames drawn per
     * shot, the attackers drawn, the words on screen, the voice. */
    state() {
      return {
        ...state,
        film: film.id,
        version: film.version,
        ms: timed.ms,
        shots: timed.shots.map((s) => ({ id: s.id, start: s.start, ms: s.ms })),
        lines: filmLines,
        skipped,
        skippable: Boolean(opts.seen),
        fromStart,
        frames: frames.slice(),
        drawn: attackers ? attackers.drawn().counts : {},
        map: film.map ?? 'itaipu',
        set: state.shot >= 0 ? (timed.shots[state.shot].set ?? null) : null,
        board: boardShown,
        music: cueOn >= 0 ? cues[cueOn].track : null,
        cast: [...cast.entries()].filter(([, c]) => c.holder.visible).map(([n]) => n),
        subtitle: sub.style.opacity === '1' ? sub.textContent : null,
        title: titleBox.style.opacity !== '0' ? titleMain.textContent : null,
        counter: counter.style.opacity !== '0' ? counterValue.textContent : null,
        hold: state.orbit ? hold.textContent : null,
        fov: camera.fov,
        camera: camera.position.toArray(),
        ground: ground(camera.position.x, camera.position.z),
        opened,
        seenTold,
        sound: ctx ? {
          ...radio.status(), cued: cued.slice(), decoded: Object.fromEntries([...buffers].map(([id, b]) => [id, Math.round(b.duration * 1000)])), anchor: anchorS,
        } : null,
      };
    },

    dispose() {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('blur', onUp);
      stopVoice();
      bedBack();
      if (attackers) {
        attackers.dispose();
      }
      for (const x of sets.values()) {
        x.dispose();
      }
      scene.remove(root);
      root.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
        }
      });
      bakedMat.dispose();
      canvas.style.filter = canvasFilter;
      overlay.remove();
      hide.remove();
      document.body.classList.remove('war-intro');
      finish();
    },
  };
  return handle;
}
