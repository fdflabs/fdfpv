/*
 * scene.js: the sky dome, and the race gates of a track built in a world.
 *
 * The gates are the in-sim builder's (src/builder/, through
 * src/render/pylons.js): the frame, the printed sleeves and header, the
 * corner fittings, the lit target the pilot aims at and the pennants a
 * flagged gate carries, with their colliders. The sky is the cel dome the
 * Alps, the airfield and Yellowstone draw behind them.
 *
 * All of it is authored directly in Three.js space (y up). Only the quad's
 * simulated state crosses frames, and that conversion lives in frame.js and
 * nowhere else.
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
import { celMaterial, outlineHull, FLAG_SAIL_CLOTH } from './celmat.js';
/* The obstacle dimensions come from the track module, which holds MultiGP's
 * published figures and converts from feet exactly once. No dimension in
 * this file is typed twice. */
import { BUILT_FRAME_TUBE_OD } from '../game/track.js';
/* The printed vinyl a gate is dressed in. See src/art/. */
import {
  BANNER_SIZE, bannerCanvas, bannerHex, GATE_BANNER_H, HEADER_NUMBER_ZONE,
  paintGateHeader, paintGateSleeve, paintFlagSailPair,
  flagMast, flagSailProfile,
} from '../art/banners.js';

const SUN_DIR = new THREE.Vector3(0.60, 0.50, 0.62).normalize();
const HORIZON = 0xf2e3cb;

/* Zenith blue. Measured at 0x2e6bb8 the sky's linear luminance was 0.248
 * and the lit meadow's was 0.257, so sky and ground occupied ONE value
 * band and separated by hue alone. Blue carries little luminance, so the
 * fix is a paler zenith rather than a bluer one. */
const SKY_HIGH = 0x6ea3d8;
/*
 * The sky, as a function, because two surfaces need it and they must not
 * disagree. The dome calls it for the direction the eye is looking, and the
 * water calls it for the direction the eye is looking AFTER reflecting off
 * the surface. If the water carried its own sky colours, a reflection would
 * be a different sky from the one overhead, which is the single fastest way
 * to make water read as painted plastic.
 *
 * Everything in here was authored on the dome and is unchanged: the 1.25
 * altitude gain with a 0.06 lift, the nine band posterisation mixed half way
 * back to the smooth gradient, and both sun terms with the ceilings that the
 * clipped sun fix established.
 */
const SKY_GLSL = /* glsl */ `
  vec3 celSkyColor(vec3 dir, vec3 sunDir, vec3 horizonCol, vec3 highCol) {
    /*
     * Re-normalise. On the dome vDir is a unit vector at each vertex, but a
     * varying interpolates linearly through the triangle, so inside a face
     * it is short by up to half a percent on a 40 by 24 dome. That was
     * invisible in the gradient and fatal to the sun, whose disc is a
     * threshold on dot(dir, sun): the old step could only fire where the
     * interpolated length happened to survive, so the disc was not a circle
     * at all but a patchwork following the tessellation.
     */
    vec3 vd = normalize(dir);
    float h = clamp(vd.y * 1.25 + 0.06, 0.0, 1.0);
    /*
     * Posterised, but only part way. At five bands with a hard step the band
     * edge is a single enormous pale arc sweeping across the sky, and in a
     * still that reads as a rendering fault rather than as a style: it was
     * the most visible artefact in every frame. Nine bands, a wider smooth
     * edge, and a mix back toward the smooth gradient keep the poster feel
     * without the arc.
     */
    float b = h * 9.0;
    float stepped = (floor(b) + smoothstep(0.35, 0.95, fract(b))) / 9.0;
    float band = mix(h, stepped, 0.5);
    vec3 col = mix(horizonCol, highCol, band);
    /*
     * Sun: a warm glow, then a disc.
     *
     * Both terms used to be added on top of a sky that was already at 0.59,
     * 0.72, 0.83 at the sun's altitude. The glow alone reached 1.0 in every
     * channel by 7.8 degrees off axis, and the disc, a 4 degree half angle
     * and thirty times the real sun, then added a further 1.0 on top of
     * that: 1.9 percent of the frame pinned at 254 or higher. So a tighter
     * glow in a colour that lifts red and green without pushing the already
     * high blue, and a disc composed by mix() to a ceiling below full white
     * with a soft outer ramp so it resolves instead of stairing. Core 1.0
     * degree half angle, ramp out to 1.6.
     */
    float sd = max(dot(vd, normalize(sunDir)), 0.0);
    col += vec3(1.0, 0.80, 0.42) * pow(sd, 40.0) * 0.30;
    col = mix(col, vec3(0.985, 0.965, 0.905), smoothstep(0.99961, 0.99985, sd));
    return col;
  }
`;


/*
 * THE GROUND, TRACED OFF THE CLUB'S OWN AERIAL.
 *
 * The world used to be an invented valley with a lake in it. It is the West
 * Coast club's flying ground now: an open paddock ringed by native bush, the
 * pavilion along its southern edge, the car park off its eastern corner, and
 * nothing else out there. The lake is gone.
 *
 * THE SHAPE IS THE PHOTOGRAPH'S, THE SIZE IS NOT, and that is a decision the
 * owner made rather than an approximation that crept in. Measured off the
 * aerial, the clubhouse spans about 61 percent of the paddock's width. In
 * here it spans 22 percent, because the pavilion is built at its real 53 m
 * and the built in circuit is 210 m wide and needs 15 m of scenery standoff
 * all round. Both cannot be true at once: matching the photograph's
 * proportions means either shrinking the circuit to about 90 m, which moves
 * every gate and voids the track record and every time posted against it, or
 * drawing the pavilion at 146 m. So the OUTLINE is traced exactly, in the
 * proportions the aerial gives, and scaled up until the course fits inside
 * it. Every structure stays its real size.
 *
 * The outline below is the paddock's five corners read off the aerial in
 * pixels, normalised by the paddock's own width and by its southern edge,
 * which is the line the pavilion stands on. Keeping them normalised is what
 * lets the one number underneath decide how big the ground is without
 * touching the shape.
 */


/*
 * The car park, off the paddock's eastern corner and running north from the
 * pavilion, where the aerial has it. Its SIZE is real, about 60 by 16 m for
 * some twenty five bays, rather than the 190 m the paddock's scaling would
 * have stretched it to. Structures keep their own size; only the ground is
 * drawn large.
 */


/*
 * WHERE THE CLUBHOUSE STANDS.
 *
 * Beside the field, on its long side, facing in. Which is one rule for both
 * race maps, because both of them ARE a rectangle of playing surface with a
 * racing line inside it: a designed course brings the rectangle with it as
 * its pitch, and the built in circuit's is the 210 by 83 m box its figure
 * eight lives in.
 *
 * The complex is placed by its FRONT WALL, which is the local origin, so the
 * numbers below are the distance from the field's edge to the building rather
 * than to the middle of a car park.
 */


/*
 * caps, when given, collects this tree's colliders. They are pushed from the
 * values the geometry is actually built from, inside the same draw, because
 * the baker merges every instance into one anonymous buffer and a tree's
 * trunk radius cannot be recovered afterwards. Nothing here consumes an
 * extra rng() value: the whole world hangs off one stream in one order, so
 * an extra draw would move every tree, flower and mountain in the valley.
 */
/*
 * `bigness` multiplies the drawn size. It is 1 for anything scattered and
 * about 2 for the boundary, because the trees in the club's own ground level
 * photograph are a wall of mature gums 12 to 18 m tall and this tree at its
 * own scale tops out near 11. Height is free: it is the same geometry with a
 * bigger number in front of it, and a taller tree closes the gaps along a
 * treeline that adding more trunks would have to pay triangles for.
 */


/*
 * The obstacle library, built to MultiGP dimensions.
 *
 * This used to be one function called gate() that built a 6.0 by 5.0 m frame
 * around a torus of radius 1.9, giving a clear span of 3.5 m. The MultiGP
 * standard gate opening is 5 ft square, 1.524 m, so the old gate was 2.30
 * times regulation, and because every judgement about how big this valley is
 * was anchored to it, a 250 mm quad read as a toy in a stadium. Every
 * dimension here now comes from src/game/track.js, which holds the published
 * figures and converts from feet once.
 *
 * What makes it read as a MultiGP gate rather than a hoop: a SQUARE opening,
 * a PVC tube frame of four members, mesh side panels outboard of the
 * uprights, and a top panel carrying the gate number. A photograph of a
 * chapter gate and a screenshot of this should be recognisably the same
 * object.
 *
 * Materials are created ONCE and shared by every obstacle, so the baker's
 * celKey buckets merge all eight obstacles' static parts into a handful of
 * draw calls. The old gate made a new celMaterial per gate and a new
 * MeshBasicMaterial per pip, which is most of why 636 of 698 draw calls
 * carried half a percent of the triangles.
 *
 * Only the parts that animate stay per obstacle: the aperture outline, its
 * halo, its additive glow, and the green target pane, whose gains are
 * driven per frame so the pilot always has a target.
 */
let SHARED = null;
function sharedObstacleMats() {
  if (SHARED) {
    return SHARED;
  }
  const vinyl = celMaterial({ color: bannerHex('vinyl'), rim: 0.22 });
  SHARED = {
    /*
     * The frame. Aluminium rather than the navy this used to be: on a real
     * course the tube is the least of the gate and the printed sleeves are
     * the whole of it, and a dark bar between two pale banners reads as a
     * hole in the middle of the structure. Light enough to be a tube in
     * sunlight, well under the sky, which is the rule everything in this
     * file obeys.
     */
    frame: celMaterial({ color: 0x9aa2b0, rim: 0.26 }),
    /* The moulded corner at every junction of upright and cross member. A
     * shade darker than the tube, because on a real gate it is a separate
     * fitting and the joint is what says the thing was assembled. */
    fitting: celMaterial({ color: 0x767f8f, rim: 0.26 }),
    /* Plain white vinyl, for the gate boards, the sleeves' substrate, and
     * the barrier walls. The start gate is identified by its mint ring, not
     * by painting the board a different colour: a green sandwich behind a
     * white print is a board that is not white. One material, so the baker
     * folds every board and every wall into the same draw. */
    panel: vinyl,
    panelStart: vinyl,
    panelRace: vinyl,
    /* The bound edge of a printed banner, and the roundel the gate number
     * is painted in. One material for both because they are the same
     * webbing tape on a real gate. */
    hem: celMaterial({ color: 0xe4d9bf, rim: 0.18 }),
    /* The numeral, DARK on the pale roundel, unlit so distance and shadow
     * cannot take the gate's number away from a pilot counting them down.
     * It used to be cream pips straight onto the dark panel, which is the
     * lower contrast pairing of the two and is not what a gate carries. */
    number: new THREE.MeshBasicMaterial({ color: 0x18202f }),
  };
  return SHARED;
}

/*
 * The course's printed dress: the gate header, the upright sleeves and the
 * flag sails, as materials, with the author's marks composited into them.
 *
 * ONE DRESS PER MARK, made once. A course carries up to five sponsors'
 * marks, and every gate wearing a given mark wears exactly the same print,
 * so the scenery merger still folds all the headers that share a sponsor
 * into one draw call. An unbranded course has one plain dress and is
 * therefore exactly what it was before any of this: a header, two sleeves
 * and two sails. Five sponsors cost five headers, ten sleeves and ten
 * sails, which is twenty draw calls for the whole of a course's dressing
 * and is the price of the feature.
 *
 * WHICH GATE WEARS WHICH is not decided here. `forGate(i)` is asked for the
 * dress of the i'th dressed structure in flying order and answers round
 * robin, so fifteen gates and five marks put each mark on three gates spread
 * down the lap rather than on three gates in a row.
 *
 * THE SAILS ALTERNATE TWO WAYS AT ONCE. A teardrop flag's sweep is navy or
 * red so a line of them down a course reads as a run rather than a repeat,
 * and now it also has to cycle through the sponsors. `sails` is the run a
 * line of flags wears: sail i carries mark i mod n with the accent i mod 2,
 * which needs lcm(n, 2) entries before it repeats. A gate's own header
 * pennants are not part of that run: both of them wear THAT GATE'S mark, in
 * the two accents, because a gate flying two sponsors' pennants over one
 * sponsor's board is not what a sponsor bought.
 *
 * THE MARKS ARRIVE LATE AND THAT IS FINE. They are data URLs out of local
 * storage, so there is no network fetch to fail, but the decode is still
 * asynchronous. Every canvas is painted at once WITHOUT them, so the world
 * is complete and correct from the first frame, and each is repainted the
 * moment its own mark decodes. Nothing waits and nothing pops except a mark
 * appearing on vinyl that was already there.
 */
function bannerKit(logoUrls, key) {
  /*
   * Mapped rather than filtered, so a slot that carries something this will
   * not put in a texture becomes an empty slot and every mark after it keeps
   * its number. Filtering would renumber them, and the decals painted on the
   * grass index the same list from src/game/trackdoc.js: a course would come
   * out with gate 3 wearing one sponsor and the paint beside it wearing
   * another. normalize() already refuses anything that is not an embedded
   * image, so this is the belt to that document rule's braces.
   */
  const urls = (Array.isArray(logoUrls) ? logoUrls : (logoUrls == null ? [] : [logoUrls]))
    .map((u) => (typeof u === 'string' && u.startsWith('data:image/') ? u : null));
  /* One plain slot when the course carries nothing, so every path below is
   * the same path and the unbranded case is not a special case. */
  const n = Math.max(1, urls.length);
  const jobs = [];
  const paint = (slot, size, painter, opts) => {
    const canvas = bannerCanvas(size[0], size[1]);
    const ctx = canvas.getContext('2d');
    painter(ctx, size[0], size[1], opts);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    jobs.push({
      slot,
      run: (logo) => {
        painter(ctx, size[0], size[1], { ...opts, logo });
        tex.needsUpdate = true;
      },
    });
    return tex;
  };
  const printed = (tex, id) => celMaterial({
    color: 0xffffff,
    /* Almost no rim on printed vinyl. The rim term is one minus the dot of
     * normal and view, and a flat banner is edge on across its whole face,
     * so any real strength washes the print out to one cool tint. */
    rim: 0.06,
    map: tex,
    /* FrontSide. Each printed face is a separate plane facing outward with
     * the substrate behind it, so a viewer never needs the reverse of one,
     * and DoubleSide is what the outline prepass cannot see. */
    side: THREE.FrontSide,
    key: `${id}:${key}`,
  });
  /* Memoised, so the run of sails and the gates' own pennants share one
   * material per mark and accent instead of painting the same canvas twice. */
  const sailCache = new Map();
  const sailOf = (slot, accent) => {
    const id = `${slot}:${accent}`;
    let mat = sailCache.get(id);
    if (!mat) {
      mat = sailMaterial(paint(slot, BANNER_SIZE.sailSheet, paintFlagSailPair, { accent }), `sail${id}:${key}`);
      sailCache.set(id, mat);
    }
    return mat;
  };

  const dress = [];
  for (let i = 0; i < n; i += 1) {
    dress.push({
      header: printed(paint(i, BANNER_SIZE.header, paintGateHeader, {}), `hdr${i}`),
      sleeve: printed(paint(i, BANNER_SIZE.sleeve, paintGateSleeve, {}), `slv${i}`),
      /* The far leg's, painted mirrored rather than scaled onto the mesh. */
      sleeveFlipped: printed(paint(i, BANNER_SIZE.sleeve, paintGateSleeve, { flip: true }), `slvf${i}`),
      /* This gate's own header pennants: its mark, both accents. */
      sails: [sailOf(i, 'navy'), sailOf(i, 'red')],
    });
  }

  const runLength = n % 2 === 0 ? n : n * 2;
  const sails = [];
  for (let i = 0; i < runLength; i += 1) {
    sails.push(sailOf(i % n, i % 2 === 1 ? 'red' : 'navy'));
  }

  const kit = {
    marks: n,
    sails,
    dress,
    forGate: (i) => dress[((Math.round(i) % n) + n) % n],
  };

  for (let slot = 0; slot < urls.length; slot += 1) {
    if (!urls[slot]) {
      continue;
    }
    const img = new Image();
    img.onload = () => {
      for (const job of jobs) {
        if (job.slot === slot) {
          job.run(img);
        }
      }
    };
    img.src = urls[slot];
  }
  return kit;
}

/*
 * Gate numbers as a 3 by 5 dot matrix. A count of pip marks was readable as
 * a quantity but not as a number, and a real gate carries a numeral, so this
 * builds one out of small boxes. Rows are top to bottom, one string per row
 * group, three characters wide.
 */
const DIGITS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};

/*
 * The three colours a gate's lit opening is ever painted.
 *
 * GATE_COLOUR is every gate at rest, START_COLOUR is the start and finish
 * line so the timing plane is identifiable before anything is lit, and
 * NEXT_COLOUR is THE ONE THE RACE WANTS NEXT: a lit pane in the opening,
 * pulsing. WRONG_COLOUR is the same pane seen from the other face, so the
 * hole reads on line one way and not the other.
 *
 * NEXT_COLOUR went green to magenta and back to green, and both moves
 * were the owner's. The magenta round answered a report that three greens
 * (start, grass, target) were being graded at 30 m/s. The owner then
 * settled it differently: the target stays a SUBTLE green glow with red
 * for the wrong direction, and every other gate carries no markings at
 * all, which removes the ambiguity at its root, there is exactly one lit
 * thing on the course at a time. The calmed gain levels from the magenta
 * round are kept; only the hue went back.
 */
export const GATE_COLOUR = 0xffd45c;
export const START_COLOUR = 0x7dffb4;
const NEXT_COLOUR = 0x39ff8b;
const WRONG_COLOUR = 0xff5a5a;

/*
 * The lit markers on an obstacle's openings: the outline the pilot aims at,
 * its halo, and the additive glow that says which gate the race wants next.
 *
 * Extracted from obstacle() so the TILTED gate below can carry exactly the
 * same target. A dive gate whose ring were a hand copy of this one would
 * drift the first time the legibility numbers below were retuned, and the
 * whole point of those numbers is that they were measured once.
 *
 * Adds the outline, halo, glow and the green target pane to `group` in
 * the obstacle's own local frame and returns them, along with which
 * opening ended up carrying the glow.
 */
export function apertureMarkers(group, sills, clearW, clearH, stack, isStart, primaryWanted) {
  /*
   * The aperture markers. Square now, because the opening is square, and
   * built as one merged geometry per obstacle so a stacked obstacle still
   * costs one draw call for all of its outlines.
   *
   * The glow sits on the PRIMARY opening, which for a stack is the named
   * hole, so a spiral lights bottom then middle then top rather than all
   * three at once.
   */
  const ringColor = isStart ? START_COLOUR : GATE_COLOUR;
  /* The middle opening by default; a course document may name a different
   * one, because a ladder flown at its top level wants the top level lit. */
  const primary = primaryWanted == null
    ? Math.floor(stack / 2)
    : Math.max(0, Math.min(stack - 1, Math.round(primaryWanted)));
  /*
   * ONE MESH PER OPENING, NOT ONE PER STRUCTURE, and that is this round's
   * change. The four bars of every level used to merge into a single ring
   * mesh, so a double or a triple stack lit ALL of its holes the moment the
   * race named any one of them and the pilot had to read a badge to find
   * out which. The owner's words: "for double and triple stacked gates only
   * the next gate you go through should be highlighted." A merged mesh
   * cannot say that; separate meshes can, by being hidden.
   *
   * The MATERIAL is still one per structure. Colour, the target hue and the
   * wrong side red all drive the material, so keeping one of it means
   * dressGate, setTargetSide and the pulse are unchanged; only visibility
   * is per opening. The cost is one draw call per level instead of one per
   * structure, which on a three hole ladder is two more.
   */
  const ringMat = new THREE.MeshBasicMaterial({ color: ringColor, fog: true });
  const haloMat = new THREE.MeshBasicMaterial({
    color: ringColor, transparent: true, opacity: 0.5, fog: true,
  });
  const rings = [];
  const halos = [];
  for (let k = 0; k < stack; k += 1) {
    const outlineGeos = [];
    const haloGeos = [];
    const cy = sills[k] + clearH * 0.5;
    /*
     * The lit bar's thickness, and it is a LEGIBILITY number.
     *
     * 0.045 m was invisible at 20 m once the opening shrank to regulation.
     * 0.075 m was measured by a pilot at 1.4 px at 20 m and 0.9 px at 30 m,
     * still sub pixel at the distance a racer has to commit to a line: at 25 m
     * the target read as a 23 px green tick dimmer than the banner flags and
     * the trees beside it. 0.16 m is 3 px at 20 m and 2 px at 30 m, the
     * smallest that survives commit range on a 900 px frame.
     *
     * The cost, stated: at 7 m the bar covers about 10 percent of the opening
     * instead of 5, so a gate right in front of the camera reads chunkier. A
     * target you cannot see until 7 m is not a target, so that is the trade.
     */
    const bar = 0.16;
    const halfW = clearW * 0.5;
    const halfH = clearH * 0.5;
    /* Four thin bars just inside the frame, so the lit line the pilot aims
     * at is the clear opening itself and not the tube around it. */
    const parts = [
      [0, cy + halfH - bar * 0.5, clearW, bar],
      [0, cy - halfH + bar * 0.5, clearW, bar],
      [-halfW + bar * 0.5, cy, bar, clearH],
      [halfW - bar * 0.5, cy, bar, clearH],
    ];
    for (const [px, py, sw, sh] of parts) {
      const geo = new THREE.BoxGeometry(sw, sh, bar);
      geo.translate(px, py, 0);
      outlineGeos.push(geo);
      const hg = new THREE.BoxGeometry(sw * 1.06 + 0.05, sh * 1.06 + 0.05, bar * 0.7);
      hg.translate(px, py, 0);
      haloGeos.push(hg);
    }
    const lvlRing = new THREE.Mesh(mergeGeometries(outlineGeos, false), ringMat);
    /* No ink on the emissive outline: the depth edge pass draws a ghost line
     * inside it, which reads as a rendering defect on the one prop the pilot
     * stares at all lap. Layer 1 skips the prepass. */
    lvlRing.layers.set(1);
    group.add(lvlRing);
    rings.push(lvlRing);
    const lvlHalo = new THREE.Mesh(mergeGeometries(haloGeos, false), haloMat);
    lvlHalo.layers.set(1);
    group.add(lvlHalo);
    halos.push(lvlHalo);
  }
  const ring = rings[0];
  const halo = halos[0];

  /* Additive glow across the primary opening. Additive so it reads as light
   * rather than paint, in the gate plane so it does not need to billboard,
   * and unlit and unfogged so distance cannot take the target away from the
   * pilot. uGain is driven per frame: bright and pulsing on the gate the
   * race wants next, nearly off on the rest. */
  /* 2.6 times the opening: the glow is how a racer finds the next gate from
   * far off, so it is deliberately much bigger than the hole and deliberately
   * bright, and distance must not take the target away from the pilot. */
  const glowSize = Math.max(clearW, clearH) * 2.6;
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(glowSize, glowSize),
    new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      uniforms: {
        uFront: { value: new THREE.Color(ringColor) },
        uBack: { value: new THREE.Color(ringColor) },
        uGain: { value: 0.1 },
        /* Half the clear opening as a fraction of the plane, so the lit
         * band lands on the frame whatever size the opening is. */
        uEdge: { value: (clearW * 0.5) / glowSize },
        /* How much of the wash goes ACROSS the opening. The comment on the
         * term below says what it is for: it is what still reads at fifty
         * metres, when the band around a 1.7526 m hole has shrunk to a few
         * pixels and a filled square has not. */
        uFill: { value: 0.16 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform vec3 uFront;
        uniform vec3 uBack;
        uniform float uGain;
        uniform float uEdge;
        uniform float uFill;
        void main() {
          /* A square band, because the opening is square. The Chebyshev
           * distance is the square's own radius. */
          vec2 d = abs(vUv - 0.5);
          float r = max(d.x, d.y);
          float band = exp(-pow((r - uEdge) / 0.055, 2.0));
          /* A wash across the opening, on top of the band. The solid
           * transparent pane (gateCue) is what you aim at up close; this
           * is what still reads at fifty metres. Green from the entry
           * face, red from the other, so a reverse approach is obvious. */
          float fill = smoothstep(uEdge, 0.0, r) * uFill;
          vec3 col = gl_FrontFacing ? uFront : uBack;
          gl_FragColor = vec4(col * (band + fill) * uGain, 1.0);
        }
      `,
    }),
  );
  glow.position.y = sills[primary] + clearH * 0.5;
  glow.layers.set(1);
  group.add(glow);
  /* The pane the pilot actually aims at: green from the entry face, red
   * from the other. Hidden until the race names this gate as next, then
   * it jumps with the target. */
  const cue = gateCue(clearW, clearH);
  cue.position.y = sills[primary] + clearH * 0.5;
  group.add(cue);
  return {
    ring, halo, rings, halos, glow, cue, fillMat: cue.userData.fillMat, ringColor, primary,
  };
}

/*
 * The target mark in an opening: a pane across the hole, hidden until the
 * race names this gate as next.
 *
 * It is double sided and it does not care which way round it is built. The
 * colour is written from outside, once a frame, off the camera's own half
 * space against the direction of travel, so a split-S, a reverse or a dive
 * all read the same way with no mesh to turn round.
 */
/*
 * The direction of travel through an opening, in scene axes.
 *
 * The same expression race.js builds its aperture frame from, so the paint
 * on a gate and the test that scores it cannot disagree about which way
 * through it goes. Kept as one function because that agreement is the whole
 * value of it: a gate that scores differently from how it looks is a gate the
 * pilot cannot learn.
 */
/* `round` makes it a disc of diameter clearW, for a sky hoop
 * (src/render/pylons.js). */
export function gateCue(clearW, clearH, round = false) {
  const cue = new THREE.Group();
  cue.visible = false;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: {
      uFront: { value: new THREE.Color(NEXT_COLOUR) },
      uBack: { value: new THREE.Color(WRONG_COLOUR) },
      uOpacity: { value: 0.22 },
      /* 1 when the pilot is on the wrong side of this gate's plane, which
       * is what draws the bar. Driven per frame from the camera's own half
       * space, not from gl_FrontFacing: see setTargetSide. */
      uWrong: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform vec3 uFront;
      uniform vec3 uBack;
      uniform float uOpacity;
      uniform float uWrong;
      void main() {
        vec3 col = gl_FrontFacing ? uFront : uBack;
        float a = uOpacity;
        /*
         * WRONG WAY IS A SHAPE, NOT ONLY A COLOUR.
         *
         * Red against green is the one axis about eight percent of men
         * cannot read, and this pane carries the single most important bit
         * on the track. So the wrong face also wears a bar across the
         * opening: two diagonals, thick enough to survive the distance the
         * pane first resolves at. The correct face stays clear, because
         * the thing the pilot has to see through it is the line beyond it.
         */
        vec2 d = vUv - 0.5;
        float x = min(abs(d.x - d.y), abs(d.x + d.y)) * 1.41421356;
        float bar = smoothstep(0.055, 0.028, x) * step(max(abs(d.x), abs(d.y)), 0.44);
        a = mix(a, min(0.72, a + 0.42 * bar), uWrong);
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  const fill = new THREE.Mesh(
    round ? new THREE.CircleGeometry(clearW * 0.47, 64) : new THREE.PlaneGeometry(clearW * 0.94, clearH * 0.94),
    mat,
  );
  cue.add(fill);
  cue.traverse((o) => o.layers.set(1));
  cue.userData.fillMat = mat;
  return cue;
}


/*
 * The gate's top banner: the printed header board a race gate wears, with
 * the number in a roundel and the event's logo beside it.
 *
 * WHAT CHANGED AND WHY. This used to be a plate 0.92 of the CLEAR OPENING
 * wide with cream pips straight onto it, which is narrower than the frame it
 * sat on and reads as a sign screwed to a hoop. A race gate's header spans
 * the whole structure, side banner to side banner, because it is one printed
 * sheet sleeved over the top rail. So the width comes from the frame's outer
 * edge and the board carries the three things a real one carries: a bound
 * hem top and bottom, a pale roundel with the number in it, and the space to
 * the right of the roundel where the logo goes.
 *
 * Extracted from obstacle() so a tilted gate wears the same banner. The
 * caller positions the group and pushes the collider it hands back, because
 * a dive gate's banner rides on the leaning frame while a standing gate's
 * sits on top of the uprights, and those are two different heights in two
 * different frames.
 */
/*
 * A printed panel: a vinyl substrate with the print on both faces.
 *
 * NOT A TEXTURED BOX, and the difference matters. A BoxGeometry maps the
 * same [0,1] square onto all six of its faces, so a banner built as one
 * textured box wears its whole design squashed across its 60 mm top edge as
 * well, which is exactly the face a pilot looks down on from above. So the
 * substrate is plain and the print is a plane on each side, the back one
 * turned so the design reads the right way round from behind, the way a
 * double sided banner is actually printed.
 */
function printedPanel(w, h, depth, mat, substrate) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), substrate);
  board.castShadow = true;
  g.add(board);
  for (const sz of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    face.position.z = sz * (depth * 0.5 + 0.004);
    if (sz < 0) {
      face.rotation.y = Math.PI;
    }
    g.add(face);
  }
  return g;
}

/*
 * The gate's header: the printed banner sleeved over the top rail, with the
 * number in a roundel at one end of it.
 *
 * WHAT CHANGED AND WHY. This used to be a plate 0.92 of the CLEAR OPENING
 * wide with cream pips straight onto it, which is narrower than the frame it
 * sat on and reads as a sign screwed to a hoop. A race gate's header spans
 * the whole structure, side banner to side banner, because it is one printed
 * sheet sleeved over the top rail. So the width comes from the frame's outer
 * edge, and what is printed on it comes from src/art/banners.js, which is
 * also what the track builder's preview draws, so an author sees the gate
 * they will fly.
 *
 * THE NUMBER IS GEOMETRY, NOT PRINT. A numeral in the texture would mean one
 * texture per gate and fourteen gates would be fourteen draw calls where
 * there is now one, so the print leaves both ends clear and a pale roundel
 * with raised pips sits in one of them.
 *
 * Extracted from obstacle() so a tilted gate wears the same banner. The
 * caller positions the group and pushes the collider it hands back, because
 * a dive gate's banner rides on the leaning frame while a standing gate's
 * sits on top of the uprights, and those are two different heights in two
 * different frames.
 */


/*
 * A flat printed panel, as a ROW of capsules rather than one fat one.
 *
 * The collision system speaks capsules, and the obvious way to wrap a panel
 * in one is to give it a radius that covers the panel's large dimension.
 * That is what the sleeves and the header board used to do, and it buys the
 * coverage by inflating the THIN axis to match: a 3 cm sleeve got a 21 cm
 * radius and the 58 cm header board got 29 cm, so a third of a metre of
 * solid nothing stood in front of a printed sheet and a line that visibly
 * cleared it did not. Same fault as the barriers, same fix: spend capsules
 * across the long axis so each one's radius can stay near the real
 * thickness. PANEL_CAP_R is the compromise, comfortably thicker than any
 * panel here so the sheet is never porous, and a third of what a single
 * capsule cost in the direction pilots actually approach from.
 *
 * `span` is the panel's long axis half length, `axis` is 'x' or 'y' for
 * which way it runs, and the returned capsules are in the gate's own frame.
 */
const PANEL_CAP_R = 0.08;

/* What a panel is to the parts that meet it: a MultiGP gate's sleeves and
 * header are "durable vinyl mesh panels" zip tied through their eyelets
 * (MultiGP, "Standard MultiGP Gate 5'x5'", shop.multigp.com), and vinyl is
 * PVC. Their kind stays 'obstacle', so the shell's own contact is
 * unchanged; without this the plant met them as concrete, the default for
 * an obstacle it is not told the material of (crashworld.js). */
const PANEL_SURFACE = 'pvc';

function panelCaps(kind, cx, cy, halfLong, halfShort, axis) {
  const out = [];
  const rows = Math.max(1, Math.ceil((halfShort * 2) / (PANEL_CAP_R * 2)));
  for (let i = 0; i < rows; i += 1) {
    const off = (i + 0.5) * ((halfShort * 2) / rows) - halfShort;
    if (axis === 'y') {
      out.push({
        kind,
        ax: cx + off, ay: cy - halfLong, az: 0,
        bx: cx + off, by: cy + halfLong, bz: 0,
        r: PANEL_CAP_R,
        surface: PANEL_SURFACE,
      });
    } else {
      out.push({
        kind,
        ax: cx - halfLong, ay: cy + off, az: 0,
        bx: cx + halfLong, by: cy + off, bz: 0,
        r: PANEL_CAP_R,
        surface: PANEL_SURFACE,
      });
    }
  }
  return out;
}

function gateBanner(index, outerW, headerMat, substrate) {
  const mats = sharedObstacleMats();
  const group = new THREE.Group();
  const boardH = GATE_BANNER_H;
  const boardW = Math.max(0.9, outerW);
  group.add(printedPanel(boardW, boardH, 0.05, headerMat, substrate));

  /*
   * The number, as many digits as it takes. This used to be
   * DIGITS[index % 10], which is correct for one digit and paints a lie for
   * two: gate 13 came out as a 3 and gate 10 as a 0, so with more than ten
   * stations two different gates would carry the same plate and a pilot
   * counting them down would be reading fiction.
   */
  const glyphs = String(Math.max(0, Math.round(index))).split('').map((d) => DIGITS[Number(d)]);
  const dot = 0.048;
  const step = 0.058;
  /*
   * The roundel has to HOLD the numeral, so it is sized from the numeral
   * rather than picked: a 3 by 5 matrix at this step is 2 steps tall from
   * the centre and 1.5 steps per glyph wide, and the circle that contains
   * that has to reach its corner. Sized by eye instead, the second digit of
   * gate 13 hung out over the edge of the disc.
   */
  const halfGlyphW = ((glyphs.length * 4 - 1) - 1) * 0.5 * step + dot * 0.5;
  const roundelR = Math.min(
    boardH * 0.40,
    Math.hypot(halfGlyphW, 2 * step + dot * 0.5) + 0.03,
  );
  /* In the clear zone the print left at the end of the banner. */
  const roundelX = -(boardW * (0.5 - HEADER_NUMBER_ZONE * 0.5));
  const roundel = new THREE.Mesh(new THREE.CylinderGeometry(roundelR, roundelR, 0.062, 20), mats.hem);
  roundel.rotation.x = Math.PI * 0.5;
  roundel.position.set(roundelX, 0, 0);
  group.add(roundel);
  /* A navy ring just proud of the disc. A pale circle on a white board
   * reads as a hole punched in it at any distance; a circle with an edge
   * reads as a number plate, which is what it is. */
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(roundelR * 1.14, roundelR * 1.14, 0.05, 20),
    mats.number,
  );
  rim.rotation.x = Math.PI * 0.5;
  rim.position.set(roundelX, 0, 0);
  group.add(rim);

  /* 3 columns per glyph plus a one column gap, centred on the roundel, on
   * BOTH faces: a gate is read from whichever side you arrive on. */
  const glyphW = 4;
  const originX = -((glyphs.length * glyphW - 1) - 1) * 0.5;
  for (let gi = 0; gi < glyphs.length; gi += 1) {
    const rows = glyphs[gi];
    for (let ry = 0; ry < rows.length; ry += 1) {
      for (let rx = 0; rx < 3; rx += 1) {
        if (rows[ry][rx] !== '1') {
          continue;
        }
        for (const sz of [-1, 1]) {
          const pip = new THREE.Mesh(new THREE.BoxGeometry(dot, dot, 0.03), mats.number);
          /*
           * MIRRORED ON THE BACK FACE, which is what a printed banner does:
           * the reverse is printed reversed so the number reads the right
           * way round from whichever side the pilot arrives on. Drawn at the
           * same offset on both faces, gate 12 reads as 21 from behind.
           */
          pip.position.set(
            roundelX + sz * (originX + gi * glyphW + rx) * step,
            (2 - ry) * step,
            sz * 0.046,
          );
          group.add(pip);
        }
      }
    }
  }

  group.userData.halfW = boardW * 0.5;
  group.userData.r = boardH * 0.5;
  return group;
}

/*
 * A small number on one opening of a stacked gate. The header still carries
 * the first station's plate; this is how the pilot sees that the hole they
 * are flying at is gate 5 and the one above it is gate 6.
 */
export function openingBadge(n, scale = 1) {
  /*
   * The badge is sized in METRES, so on a RaceGOW stack a 0.30 m disc hung
   * beside a 0.711 m opening covered half the hole next to it. `scale` is
   * the ratio of the openings, applied to the disc, the glyphs and the
   * standoff at the call site together, because a badge that shrinks and
   * keeps its 0.22 m gap is a disc floating in the air beside a gate.
   */
  const mats = sharedObstacleMats();
  const group = new THREE.Group();
  const r = 0.15 * scale;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.04 * scale, 16), mats.hem);
  disc.rotation.x = Math.PI * 0.5;
  group.add(disc);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.14, r * 1.14, 0.03 * scale, 16), mats.number);
  rim.rotation.x = Math.PI * 0.5;
  group.add(rim);
  const glyphs = String(Math.max(0, Math.round(n))).split('').map((d) => DIGITS[Number(d)]);
  const dot = 0.028 * scale;
  const step = 0.034 * scale;
  const glyphW = 4;
  const originX = -((glyphs.length * glyphW - 1) - 1) * 0.5;
  for (let gi = 0; gi < glyphs.length; gi += 1) {
    const rows = glyphs[gi];
    for (let ry = 0; ry < rows.length; ry += 1) {
      for (let rx = 0; rx < 3; rx += 1) {
        if (rows[ry][rx] !== '1') {
          continue;
        }
        for (const sz of [-1, 1]) {
          const pip = new THREE.Mesh(new THREE.BoxGeometry(dot, dot, 0.02), mats.number);
          pip.position.set(
            sz * (originX + gi * glyphW + rx) * step,
            (2 - ry) * step,
            sz * 0.028,
          );
          group.add(pip);
        }
      }
    }
  }
  return group;
}

/*
 * The elbow fittings at the four corners of one opening.
 *
 * Cheap and worth every triangle: a square of four tubes butted together is
 * an abstraction, and a square of four tubes with a moulded corner at each
 * junction is a thing somebody assembled out of a parts list. Boxes rather
 * than cylinders on purpose, because obstacle() recovers the clear opening
 * by finding its own vertical cylinders and a fifth one would change what it
 * measures.
 */
function cornerFittings(group, sills, clearW, clearH, tubeR) {
  const mats = sharedObstacleMats();
  const s = tubeR * 2.9;
  for (const sillY of sills) {
    for (const sy of [sillY - tubeR, sillY + clearH + tubeR]) {
      for (const sx of [-1, 1]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(s, s, s * 0.92), mats.fitting);
        f.position.set(sx * (clearW * 0.5 + tubeR), sy, 0);
        f.castShadow = true;
        group.add(f);
      }
    }
  }
}


/*
 * One obstacle, at its BUILT dimensions.
 *
 * `spec` is a set of built dimensions: clearW, clearH, sillH, an optional
 * stack, and a kindName for the assertion and the scoring to name it by: the
 * in-sim builder's gateSpec (src/builder/course.js).
 *
 * index is the gate's number in FLYING order, painted on the top panel.
 * isStart makes it the start and finish gate, which is green. opts.primary
 * names which opening carries the glow, for a stack flown at a stated level.
 *
 * Returns the group, the per obstacle animated materials, the apertures (one
 * per opening, so a ladder returns three), and the colliders in the group's
 * OWN local frame, for the placement code to transform. Local frame: x
 * across the opening, y up from the base, z through the opening.
 */
function obstacle(spec, index, isStart, opts = {}) {
  if (!spec) {
    throw new Error('scene: obstacle called without a spec');
  }
  const kindName = spec.kindName ?? 'standardGate';
  const g = new THREE.Group();
  const mats = sharedObstacleMats();
  /* A plane sized gate (src/builder/course.js gateSpec) names its own pipe
   * and the collider kind that pipe gives as (src/game/crashworld.js). */
  const tubeR = (spec.tubeOD ?? BUILT_FRAME_TUBE_OD) * 0.5;
  const frameKind = spec.frameKind ?? 'gate';
  const clearW = spec.clearW;
  const clearH = spec.clearH;
  const stack = spec.stack ?? 1;
  const caps = [];

  /*
   * Where each opening's sill sits.
   *
   * MultiGP publishes the opening and the elevation but NOT the spacing
   * between the openings of a stacked obstacle, so the spacing is derived:
   * two openings share one cross member, so the pitch is one clear height
   * plus one tube diameter. That rests on the tube diameter, which
   * track.js marks as an assumption (1 inch nominal schedule 40 PVC) and
   * not as a citation, so the ladder's overall height is an assumption too.
   * The openings themselves are published and exact.
   */
  /* A caller with its own figure wins. A track document carries the level
   * spacing it was authored with, and defaulting over the top of it would
   * quietly rebuild somebody's ladder at a spacing they did not choose. */
  const pitch = spec.levelPitch ?? (clearH + BUILT_FRAME_TUBE_OD);
  const sills = [];
  for (let k = 0; k < stack; k += 1) {
    sills.push(spec.sillH + k * pitch);
  }
  const topSurface = sills[stack - 1] + clearH;

  /* Uprights. Their INNER surfaces are the opening's width, so their
   * centres sit half a tube outboard of the clear span. They run from the
   * ground to just above the topmost cross member, which is what makes a
   * tower or a dive gate a tower rather than a floating hoop. */
  const upX = clearW * 0.5 + tubeR;
  const upTop = topSurface + 2 * tubeR;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(tubeR, tubeR, upTop, 8),
      mats.frame,
    );
    post.position.set(sx * upX, upTop * 0.5, 0);
    post.castShadow = true;
    outlineHull(post, 1.06);
    g.add(post);
    caps.push({ kind: frameKind, ax: sx * upX, ay: 0, az: 0, bx: sx * upX, by: upTop, bz: 0, r: tubeR });

    /* A foot, so it looks like it is standing on the grass rather than
     * growing out of it: a MultiGP gate's 0.34 by 0.62 m weighted base. */
    const footW = 0.34;
    const footH = 0.08;
    const footD = 0.62;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(footW, footH, footD), mats.frame);
    foot.position.set(sx * upX, footH * 0.5, 0);
    foot.castShadow = true;
    g.add(foot);
    caps.push({
      kind: 'obstacle',
      ax: sx * upX, ay: footH * 0.5, az: -footD * 0.5,
      bx: sx * upX, by: footH * 0.5, bz: footD * 0.5,
      r: footW * 0.5,
    });
  }

  /* Cross members. One above every opening, and one below the lowest
   * opening only when that opening is off the ground: a gate standing on
   * grass has the ground as its sill, which is how a 5 ft opening is
   * measured on a chapter gate. */
  const memberLen = clearW + 4 * tubeR;
  const members = [];
  for (let k = 0; k < stack; k += 1) {
    members.push(sills[k] + clearH + tubeR);
  }
  if (spec.sillH > 0) {
    members.push(spec.sillH - tubeR);
  }
  for (const my of members) {
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(tubeR, tubeR, memberLen, 8),
      mats.frame,
    );
    bar.rotation.z = Math.PI * 0.5;
    bar.position.set(0, my, 0);
    bar.castShadow = true;
    outlineHull(bar, 1.06);
    g.add(bar);
    caps.push({ kind: frameKind, ax: -memberLen * 0.5, ay: my, az: 0, bx: memberLen * 0.5, by: my, bz: 0, r: tubeR });
  }

  /* The moulded corner at every junction of upright and cross member. */
  cornerFittings(g, sills, clearW, clearH, tubeR);

  /*
   * The printed sleeves, outboard of each upright. They are what a pilot
   * actually reads the gate's plane from at speed, and they are solid, so
   * their collider sits entirely outboard of the clear span.
   */
  const panelW = 0.42;
  const kit = opts.kit;
  const substrate = isStart ? mats.panelStart : mats.panelRace;
  const panelBottom = sills[0];
  const panelH = topSurface - panelBottom;
  for (const sx of [-1, 1]) {
    const cx = sx * (upX + tubeR + panelW * 0.5);
    /* Mirrored on the far leg, so the chequer column runs down the OUTSIDE
     * of the gate on both sides rather than down the outside of one and the
     * inside of the other. Mirrored in the PAINT, so nothing about the mesh
     * or its winding changes. */
    const sleeve = printedPanel(panelW, panelH, 0.03,
      sx < 0 ? kit.sleeveFlipped : kit.sleeve, substrate);
    sleeve.position.set(cx, panelBottom + panelH * 0.5, 0);
    g.add(sleeve);
    caps.push(...panelCaps(
      'obstacle', cx, panelBottom + panelH * 0.5, panelH * 0.5, panelW * 0.5, 'y',
    ));
  }

  /* The header banner, spanning the whole structure. The header flags and
   * the reported top of the structure are measured from it. */
  const outerW = 2 * (upX + tubeR + panelW);
  const plateGroup = gateBanner(index, outerW, kit.header, substrate);
  const plateY = upTop + GATE_BANNER_H * 0.5 + 0.03;
  const plateHalfW = plateGroup.userData.halfW;
  const plateR = plateGroup.userData.r;
  plateGroup.position.set(0, plateY, 0);
  g.add(plateGroup);
  caps.push(...panelCaps('obstacle', 0, plateY, plateHalfW, plateR, 'x'));

  /* The lit target, shared with the plane sized gates (src/render/pylons.js). */
  const marks = apertureMarkers(g, sills, clearW, clearH, stack, isStart, opts.primary);
  const { ring, halo, glow, cue, ringColor, primary } = marks;

  /*
   * The apertures, MEASURED out of the geometry that was just built rather
   * than restated from the spec. The clear width is the gap between the two
   * uprights' inner surfaces and the clear height is the gap between the
   * cross members', both recovered from the meshes' own positions and their
   * own geometry parameters. T1 asserts the standard gate at 1.524 m within
   * 10 mm, and an assertion against a number somebody typed twice asserts
   * nothing at all.
   */
  const postMeshes = g.children.filter((c) => c.isMesh && c.geometry.type === 'CylinderGeometry'
    && Math.abs(c.rotation.z) < 1e-6);
  const measuredW = postMeshes.length >= 2
    ? Math.abs(postMeshes[1].position.x - postMeshes[0].position.x)
      - 2 * postMeshes[0].geometry.parameters.radiusTop
    : clearW;
  const apertures = [];
  for (let k = 0; k < stack; k += 1) {
    /* The clear height of opening k is its sill to the underside of the
     * member above it, both of which are positions in this group. */
    const memberY = sills[k] + clearH + tubeR;
    const measuredH = (memberY - tubeR) - sills[k];
    apertures.push({
      shape: 'square',
      index: k,
      sillH: sills[k],
      centreY: sills[k] + measuredH * 0.5,
      clearW: measuredW,
      clearH: measuredH,
    });
  }

  const headerTop = plateY + plateR;
  const flags = attachHeaderFlags(g, opts, {
    headerTop,
    halfW: plateHalfW,
  });
  caps.push(...flags.colliders);

  return {
    group: g,
    kindName,
    /* The top of the header board, or of a header pennant if this gate
     * carries one, in this obstacle's own frame. */
    top: Math.max(headerTop, flags.top),
    /* The lit parts have per obstacle materials driven every frame, so they
     * stay live; everything else bakes. Header sails wave, so they stay live
     * too. */
    animate: [...marks.rings, ...marks.halos, glow, cue, ...flags.animate],
    ringMat: ring.material,
    haloMat: halo.material,
    /* One per opening, so a stack can light the hole the race wants and
     * leave the others dark. The material above is still shared. */
    ringMeshes: marks.rings,
    haloMeshes: marks.halos,
    glowMat: glow.material,
    glowMesh: glow,
    cueGroup: cue,
    fillMat: marks.fillMat,
    ringColor,
    apertures,
    primary,
    aperture: apertures[primary],
    colliders: caps,
  };
}

/*
 * Pennants on a gate header. Left is local -X, right is +X and TOP is 0, the
 * centre of the board, as seen facing the gate. The mast stands on the
 * board; the sail extends outboard so it does not cover the opening or the
 * number roundel, and a centre mast hangs its cloth to the right, which is
 * where a single flag hangs by convention. Poles bake with the frame; sails
 * stay live because they carry the cloth attribute.
 */
function attachHeaderFlags(g, opts, layout) {
  const signs = opts.flagSigns;
  if (!signs || !signs.length) {
    return { top: 0, animate: [], colliders: [] };
  }
  const flagH = Math.max(0.2, opts.flagH ?? 1.45);
  const mast = Math.max(0.008, opts.flagPoleR ?? 0.012);
  const headerTop = layout.headerTop;
  const halfW = layout.halfW;
  const kit = opts.kit;
  const mats = sharedObstacleMats();
  const animate = [];
  const colliders = [];
  const flags = new THREE.Group();
  g.add(flags);
  const curve = flagMast(flagH);
  let i = 0;
  for (const sx of signs) {
    const x = sx * halfW;
    /* Outboard, on both ends, and to the right from the centre. The pennant
     * is the same feather flag the course is lined with at a pennant's
     * size, so the mast bends the way the big ones do and the whole thing
     * turns as one: the mast and the sail take the same position and the
     * same half turn, because the geometry of both starts at the mast's
     * butt. The LEAN is a separate reading of the sign, because zero means
     * the middle of the board rather than no offset at all. */
    const lean = opts.flagLeans && opts.flagLeans[i] ? opts.flagLeans[i] : (sx < 0 ? -1 : 1);
    const turn = lean < 0 ? Math.PI : 0;
    const pole = new THREE.Mesh(flagMastGeometry(mast, flagH), mats.frame);
    pole.position.set(x, headerTop, 0);
    pole.rotation.y = turn;
    pole.castShadow = true;
    flags.add(pole);
    if (kit && kit.sails && kit.sails.length) {
      const sail = new THREE.Mesh(
        flagSailGeometry(mast, flagH),
        kit.sails[i % kit.sails.length],
      );
      sail.position.set(x, headerTop, 0);
      sail.rotation.y = turn;
      sail.castShadow = true;
      flags.add(sail);
      animate.push(sail);
    }
    /* Straight pole, then the whip, in this obstacle's own frame. The whip
     * leans outboard, which is the same direction the sail hangs. */
    const r = Math.max(0.05, mast);
    colliders.push({
      kind: 'obstacle',
      ax: x, ay: headerTop, az: 0,
      bx: x, by: headerTop + curve.bendY, bz: 0,
      r,
    });
    colliders.push({
      kind: 'obstacle',
      ax: x, ay: headerTop + curve.bendY, az: 0,
      bx: x + lean * curve.tip.x, by: headerTop + curve.tip.y, bz: 0,
      r,
    });
    i += 1;
  }
  return { top: headerTop + flagH, animate, colliders };
}


/*
 * The mast, as a tapered tube along the bent centreline.
 *
 * NOT a TubeGeometry, and the reason is the taper: a feather flag's whip is
 * visibly thinner than the pole under it, and TubeGeometry carries one
 * radius. Building the rings by hand is a dozen lines and gets both.
 *
 * The centreline is planar, in xy, so the frame at every point is exact
 * rather than swept: the in plane normal is the tangent turned a quarter,
 * and the out of plane one is z. A Frenet frame on a curve this shallow
 * would twist for no reason.
 *
 * The mesh's ORIGIN IS THE BUTT, at y = 0, so a caller positions it where
 * the mast enters the ground and the sail shares that origin exactly. The
 * old straight cylinder was centred and every call site carried its own
 * half height to correct for it.
 */
function flagMastGeometry(poleR, h, radial = 5) {
  const { points } = flagMast(h);
  const pos = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    /* The tangent turned a quarter, in the flag's own plane. */
    const nx = -ty;
    const ny = tx;
    const r = poleR * p.r;
    for (let a = 0; a < radial; a += 1) {
      const th = (a / radial) * Math.PI * 2;
      const ca = Math.cos(th);
      const sa = Math.sin(th);
      pos.push(p.x + nx * ca * r, p.y + ny * ca * r, sa * r);
      /*
       * A uv nothing samples, and it is not optional. The scenery merger
       * folds this mesh in with everything else that shares its material,
       * and BufferGeometryUtils.mergeGeometries refuses a set whose members
       * do not carry the SAME attributes: a mast with no uv beside a gate
       * tube with one drops the whole bucket and takes the frame with it.
       */
      uvs.push(a / radial, i / (points.length - 1));
    }
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    for (let a = 0; a < radial; a += 1) {
      const a0 = i * radial + a;
      const a1 = i * radial + ((a + 1) % radial);
      idx.push(a0, a0 + radial, a1, a1, a0 + radial, a1 + radial);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function flagSailGeometry(poleR, h) {
  /* Rows up the mast, columns out from it. The rows come from
   * flagSailProfile, which splits them across the rectangular body and the
   * swept corner so the print has the same metres per row in both; five
   * columns is what the cloth wave needs to read as a wave. */
  const { rows: profile } = flagSailProfile(h);
  const rows = profile.length;
  const cols = 5;
  const pos = [];
  const uvMinusZ = [];
  const uvPlusZ = [];
  const cloth = [];
  const idx = [];
  for (let r = 0; r < rows; r += 1) {
    const row = profile[r];
    const t = row.t;
    for (let c = 0; c < cols; c += 1) {
      const s = c / (cols - 1);
      /* The seam is ON the mast, not near it, and it stays there round the
       * bend because the leading point IS a point of the mast's centreline. */
      pos.push(poleR + row.lx + (row.tx - row.lx) * s, row.ly + (row.ty - row.ly) * s, 0);
      /*
       * One half of the printed sheet per sheet of cloth, and WHICH HALF IS
       * DECIDED BY WHICH WAY THE SHEET FACES. The winding below settles
       * that: the triangles in `idx` come out clockwise seen from +z, so
       * they face -z, and it is the ones in `back` that a viewer standing on
       * the +z side sees. u runs with the sail's own +x, which is to the
       * RIGHT of that +z viewer, so the +z facing sheet is the one that
       * reads the sheet's left half straight and the -z facing one reads the
       * right half BACKWARDS. That is what puts the accent band on the mast
       * for a viewer on either side and the mark the right way round for
       * both. Swap this pair and the mark is mirrored on BOTH sides instead
       * of neither, which is what a capture of it looked like.
       * See paintFlagSailPair in src/art/banners.js.
       */
      uvMinusZ.push(1 - s * 0.5, t);
      uvPlusZ.push(s * 0.5, t);
      cloth.push(s, t);
    }
  }
  /*
   * BOTH WINDINGS, and this is the fix for the flags reading as see through.
   *
   * A sail is one sheet, so it was drawn with side: DoubleSide. That is
   * right for the colour pass and WRONG for everything else in this
   * renderer, because the outline prepass in src/render/post.js overrides
   * every material in the scene with one of its own, and that override is
   * FrontSide. A flag turned so the camera sees its back therefore wrote no
   * depth and no normal into the prepass at all, so the composite resolved
   * that region against the background and blended the sail into whatever
   * was behind it. Every flag is yawed at random, so about half of them were
   * transparent and half were solid, which is exactly what it looked like.
   *
   * Emitting the reversed triangles here makes the sail an ordinary opaque
   * two sided SURFACE that every pass agrees about: the prepass sees front
   * faces from either side, the shadow map does too, and the material can go
   * back to FrontSide.
   *
   * The normals are NOT flipped with the winding, deliberately. The cloth
   * displacement in celmat.js moves each vertex along its own normal, so
   * flipping them would drive the two sheets apart by twice the wave
   * amplitude and split the flag down the middle. Sharing the normal costs
   * the reverse face its own lighting, which on a flat cel shaded banner is
   * a difference nobody can see.
   *
   * THE REVERSE HAS ITS OWN VERTICES NOW, and only because it has to have
   * its own texture coordinates: it reads the other half of the sheet. It
   * shares everything else with the front, position, wave and normal alike,
   * so the two sheets still move as one piece of cloth and the paragraph
   * above still holds. Fourteen rows of five is seventy vertices; doubling
   * that is nothing, and it is what stops every mark on the course reading
   * in a mirror from behind.
   */
  const n = rows * cols;
  const back = [];
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const a = r * cols + c;
      idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      back.push(
        n + a + 1, n + a + cols, n + a,
        n + a + cols + 1, n + a + cols, n + a + 1,
      );
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos.concat(pos), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvMinusZ.concat(uvPlusZ), 2));
  geo.setAttribute('aCloth', new THREE.Float32BufferAttribute(cloth.concat(cloth), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  /*
   * The reverse block is not in that index, so it came out of
   * computeVertexNormals with no normal at all. Copy the front's across
   * rather than computing over both sheets, which would average each pair
   * of opposed faces to nothing.
   */
  const nrm = geo.getAttribute('normal');
  for (let i = 0; i < n; i += 1) {
    nrm.setXYZ(n + i, nrm.getX(i), nrm.getY(i), nrm.getZ(i));
  }
  nrm.needsUpdate = true;
  geo.setIndex(idx.concat(back));
  return geo;
}

/*
 * A sail material. Takes the PAINTED TEXTURE rather than a colour, because a
 * race flag is a printed thing and not a coloured one, and one material per
 * print is what keeps the whole set of them inside two draw calls.
 */
function sailMaterial(tex, key) {
  return celMaterial({
    color: 0xffffff,
    /* No rim on the cloth. The rim term is one minus dot(normal, view), and
     * a near flat sail seen at any angle is edge on across its whole
     * surface, so the cool rim colour covered the entire flag: measured on
     * the old plain cloth, a dark red flag came out rgb 151 93 113, a dusty
     * pink nothing in the palette holds. */
    rim: 0.0,
    map: tex,
    /* FrontSide, with the reverse faces in the geometry. See
     * flagSailGeometry: DoubleSide is invisible to the outline prepass's
     * override material and made half the flags transparent. */
    side: THREE.FrontSide,
    cloth: FLAG_SAIL_CLOTH,
    key,
  });
}


export function skyDome() {
  const geo = new THREE.SphereGeometry(1500, 40, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uHigh: { value: new THREE.Color(SKY_HIGH) },
      uHorizon: { value: new THREE.Color(HORIZON) },
      uSun: { value: SUN_DIR.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${SKY_GLSL}
      varying vec3 vDir;
      uniform vec3 uHigh;
      uniform vec3 uHorizon;
      uniform vec3 uSun;
      void main() {
        gl_FragColor = vec4(celSkyColor(vDir, uSun, uHorizon, uHigh), 1.0);
      }
    `,
  });
  /*
   * THE SKY GOES WHERE THE CAMERA GOES. It was a 1500 m sphere fixed at the
   * origin, which a town never leaves and the Alps, 24 km across with a
   * 14 km camera, leave in a minute: past its shell the pilot saw the
   * scene background, a near white, where the sky should be. Centred on
   * the rendering camera each frame instead, drawn first and behind
   * everything, so it is always the backdrop and never in front of a
   * ridge further away than its radius.
   */
  mat.depthTest = false;
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  sky.onBeforeRender = (renderer, scene, camera) => {
    sky.position.setFromMatrixPosition(camera.matrixWorld);
    sky.updateMatrixWorld();
  };
  return sky;
}


/* How far the 'follow' tier dims a ring. The race no longer lights a follow
 * gate (see setNextGate); the in-sim builder dims every gate it is not
 * pointing at with it. */
const FOLLOW_RING = 0.42;

/*
 * A gate's markings for one tier: 'target', 'follow' or 'dark'. Module
 * scope rather than inside the field's builder so the in-sim builder
 * (src/builder/) dresses the gates it places exactly the way the field does.
 */
export function dressGate(gt, tier) {
  /* Material.visible, not a colour near black: the ring is opaque
   * geometry just inside the opening, so a dark ring is a dark bar across
   * the hole rather than an absent one. */
  gt.ringMat.visible = tier !== 'dark';
  gt.haloMat.visible = tier === 'target';
  gt.glowMat.visible = tier === 'target';
  /*
   * WHICH OPENING OF A STACK, and it is the mesh that says so rather than
   * the material, because every opening on one structure shares the
   * material that carries the colour. A ladder used to light all three
   * holes at once and leave the pilot to read a badge for the one they
   * were actually being sent through. Now only the named hole lights.
   */
  if (gt.ringMeshes) {
    for (let k = 0; k < gt.ringMeshes.length; k += 1) {
      const lit = tier !== 'dark' && gt.litApertures.indexOf(k) >= 0;
      gt.ringMeshes[k].visible = lit;
      if (gt.haloMeshes && gt.haloMeshes[k]) {
        gt.haloMeshes[k].visible = lit && tier === 'target';
      }
    }
  }
  if (tier === 'follow') {
    gt.ringMat.color.set(gt.ringColor).multiplyScalar(FOLLOW_RING);
  } else {
    gt.ringMat.color.set(gt.ringColor);
  }
  gt.haloMat.color.set(gt.ringColor);
  gt.glowMat.uniforms.uFront.value.set(gt.ringColor);
  gt.glowMat.uniforms.uBack.value.set(gt.ringColor);
  gt.haloMat.opacity = 0.34;
  gt.glowMat.uniforms.uGain.value = 0.08 * (gt.glowGain ?? 1);
  if (gt.cueGroup) {
    gt.cueGroup.visible = Boolean(gt.virtual) && tier !== 'dark';
  }
  if (gt.fillMat) {
    gt.fillMat.uniforms.uWrong.value = 0;
    gt.fillMat.uniforms.uOpacity.value = tier === 'target' ? 0.22 : 0.10;
  }
}

/* The one gate the race wants next, lit. The side it is seen from is
 * colourTargetSide's, every frame. */
export function lightTarget(target) {
  dressGate(target, 'target');
  target.ringMat.color.set(NEXT_COLOUR);
  target.haloMat.color.set(NEXT_COLOUR);
  target.glowMat.uniforms.uFront.value.set(NEXT_COLOUR);
  target.glowMat.uniforms.uBack.value.set(WRONG_COLOUR);
  /* 0.55, down from 0.95. The report: the target glow was bright enough
   * to obscure the gate's own dressing, a flag gate read as a glowing
   * box with the pennant washed out. The edge band stays legible at
   * 0.55; what goes is the interior bloom that painted over the frame. */
  target.glowMat.uniforms.uGain.value = 0.55 * (target.glowGain ?? 1);
  /* A stacked figure shares one glow across its openings. Put that
   * glow, and the pane, on the hole this station names. */
  if (target.trackGlow && target.aperture) {
    if (target.glowMesh) {
      target.glowMesh.position.y = target.aperture.centreY;
    }
    if (target.cueGroup) {
      target.cueGroup.position.y = target.aperture.centreY;
    }
  }
  if (target.cueGroup) {
    target.cueGroup.visible = true;
  }
}

/* Green from the side the target is flown from, red from the other. */
export function colourTargetSide(target, correct) {
  const col = correct ? NEXT_COLOUR : WRONG_COLOUR;
  target.ringMat.color.set(col);
  target.haloMat.color.set(col);
  /* Both faces, because the side is now the camera's and not the
   * fragment's. A pane seen edge on used to flicker between the two. */
  target.glowMat.uniforms.uFront.value.set(col);
  target.glowMat.uniforms.uBack.value.set(col);
  if (target.fillMat) {
    target.fillMat.uniforms.uFront.value.set(col);
    target.fillMat.uniforms.uBack.value.set(col);
    target.fillMat.uniforms.uWrong.value = correct ? 0 : 1;
  }
}

/*
 * ONE RACE GATE, BUILT THE WAY THE FIELD BUILDS ITS OWN, for a caller that
 * stands it in a world itself: the in-sim builder (src/builder/), which places
 * gates in the swiss2 and alps valleys at any orientation. It is obstacle()
 * with the one plain banner kit every such gate shares, and it hands back the
 * same object obstacle() does: the group in its own frame (x across the
 * opening, y up from the base, z through it), the measured apertures, and
 * the lit parts dressGate and lightTarget drive. Nothing is baked and no
 * collider is added: the caller owns the group and its lifetime.
 */
let standaloneKit = null;
export function standaloneGate(spec, index, isStart, opts = {}) {
  standaloneKit ??= bannerKit(null, 'standalone');
  return obstacle(spec, index, isStart, { ...opts, kit: standaloneKit.forGate(0) });
}

/* Free what standaloneGate built. The shared obstacle materials and the kit's
 * printed ones outlive any one gate, so only the gate's own go. */
export function disposeStandaloneGate(made) {
  const keep = new Set(Object.values(sharedObstacleMats()));
  if (standaloneKit) {
    for (const d of standaloneKit.dress) {
      keep.add(d.header);
      keep.add(d.sleeve);
      keep.add(d.sleeveFlipped);
      d.sails.forEach((m) => keep.add(m));
    }
    standaloneKit.sails.forEach((m) => keep.add(m));
  }
  made.group.traverse((o) => {
    if (o.geometry) {
      o.geometry.dispose();
    }
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m && !keep.has(m)) {
        m.dispose();
      }
    }
  });
}

/*
 * The race field's world. The renderer, the camera and the airframe are the
 * session's, not this map's, and arrive in `shell`; everything built here
 * belongs to this map and dies with it. See src/maps/README.md for the
 * contract and src/render/shell.js for what the session keeps.
 *
 * `onProgress(fraction)` is called as construction advances, so the loading
 * screen reports work that actually happened rather than a timer. It is
 * optional and the map builds identically without it.
 */
/*
 * The race field.
 *
 * `course` is optional. Without it this builds the built in figure eight
 * exactly as it always has: same curve, same fourteen stations, same terrain,
 * same rng stream. With it, the same world is built around a DESIGNED course
 * instead, from a track document that src/game/trackdoc.js has already turned
 * into scene coordinates. Everything that is not the course, the sky, the
 * ridges, the lake, the grass, the light, the post chain, is shared, because
 * the point of flying your own track is to fly it in this world rather than
 * in a grey box.
 */

