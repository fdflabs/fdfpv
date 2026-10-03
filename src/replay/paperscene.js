/*
 * paperscene.js: the combat streamers in a replay, drawn.
 *
 * A clip's paper (src/replay/paper.js) is drawn by a streamer layer of the
 * replay's own (src/render/streamers.js), asked for the same ribbons the
 * live one was asked for at that frame: the same seats' colours, the same
 * tow points, the same flutter clock, the chains' nodes as recorded. So
 * the paper flutters, twists and falls as it did, at any speed; a scrub
 * is a pose like any other.
 *
 * THE CUTS. A cut's burst of paper and its glint are thrown again when the
 * playhead passes the moment going forward, at any speed, and fly on the
 * clip's clock, so slow motion is slow paper. Anywhere else (a scrub, a
 * jump, the first frame) the air is cleared and the bursts of the last
 * CONFETTI_S before the playhead are thrown again and flown up to it, so a
 * frame just after a cut shows the paper in the air, as the replay's own
 * smoke does. The squares' scatter is random, as it is live.
 *
 * CATCH THE ACE rides the same events: a crown's burst (src/render/
 * acecrown.js) is thrown again as a cut's is, and after a jump the one
 * still in the air is thrown again at its age; its crown flies to where
 * the replayed bubble is drawn, the new Ace. Its coin rings as the
 * SCHWING does, below.
 *
 * A WAR'S EXPLOSIONS the same way (src/render/explosion.js): thrown again
 * when the playhead passes them, thrown at their age after a jump, so a
 * frame a second after a kill shows the fireball a second old and its
 * smoke; each sounds on playback as the SCHWING does, in the world's
 * voice from where it went off (the shell's worldBoom, its echoes and
 * delay from the replay's camera, as live), or without one the mix's own
 * boom from as far off as the camera is.
 *
 * THE SCHWING sounds when playback passes a cut going forward, at the
 * level it rang at, scaled down in slow motion the way the replay's crash
 * sounds are (src/replay/crashcam.js events), and never on a scrub, a jump
 * or a frame step: those are looking for a moment, not playing it, and a
 * sword ringing each time the playhead is dragged over a cut is noise.
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

import { CONFETTI_S, createStreamerLayer } from '../render/streamers.js';
import { CROWN_FX_S, createCrownFx } from '../render/acecrown.js';
import { EXPLOSION_S, SIZE_MAX, createExplosions } from '../render/explosion.js';
import { createPaperSample, samplePaper } from './paper.js';

/* A step when flying the bursts up to the playhead after a jump. */
const REBUILD_STEP_S = 1 / 60;

/*
 * `paper` is a clip's, `n` its rows; `parent` the scene; `audio` the
 * shell's (its schwing() and coin(), when it has them); floorAt what the
 * paper lies on, as the live layer has it (src/render/streamers.js).
 */
export function createPaperScene(paper, n, parent, audio, floorAt, worldBoom = null) {
  const layer = createStreamerLayer(floorAt);
  parent.add(layer.group);
  /* The crown's burst, only for a clip that has one. */
  const fx = paper.events.some((e) => e.type === 'crown') ? createCrownFx() : null;
  if (fx) {
    parent.add(fx.group);
  }
  /* A war's explosions, only for a clip that has one. */
  const booms = paper.events.some((e) => e.type === 'boom') ? createExplosions() : null;
  if (booms) {
    parent.add(booms.group);
  }
  let boomsRung = 0;
  const camAt = [0, 0, 0];
  const sample = createPaperSample();
  let schwings = 0;
  let coins = 0;
  let last = null;

  function advance(from, to) {
    let t = from;
    while (t < to - 1e-9) {
      const dt = Math.min(REBUILD_STEP_S, to - t);
      layer.update(dt);
      t += dt;
    }
  }

  /* The air cleared, and the bursts of the last CONFETTI_S before t
   * thrown again and flown up to it. */
  function rebuild(t) {
    layer.clear();
    if (fx) {
      fx.clear();
      const e = paper.events.filter((x) => x.type === 'crown' && x.t <= t && x.t > t - CROWN_FX_S).at(-1);
      if (e) {
        fx.play(e.p, e.from, e.level, t - e.t);
      }
    }
    if (booms) {
      booms.clear();
      for (const e of paper.events) {
        if (e.type === 'boom' && e.t <= t && e.t > t - EXPLOSION_S) {
          booms.play(e.p, e.level * SIZE_MAX, t - e.t);
        }
      }
    }
    let at = null;
    for (const e of paper.events) {
      if (e.type !== 'cut' || e.t > t || e.t < t - CONFETTI_S) {
        continue;
      }
      if (at !== null) {
        advance(at, e.t);
      }
      layer.burst(e.p, e.colour, e.level);
      at = e.t;
    }
    if (at !== null) {
      advance(at, t);
    }
  }

  /*
   * The frame at clip time `to`, rows k and k + 1 and `a` between, drawn
   * last at `from`. playing and speed are the transport's; camera and
   * viewHeight are for the ribbons' least width; target is the new Ace
   * as the replay draws it (the bubble's centre), or null.
   */
  function frame(k, a, from, to, playing, speed, camera, viewHeight, target = null) {
    const forward = to >= from && to - from < 0.25;
    /* A burst already in the air ages with the clip; one thrown below is
     * thrown at its own age. */
    if (fx && forward) {
      fx.frame(to - from, camera, target);
    }
    if (!forward) {
      rebuild(to);
    } else if (to > from) {
      for (const e of paper.events) {
        if (e.t <= from || e.t > to) {
          continue;
        }
        if (e.type === 'cut') {
          layer.burst(e.p, e.colour, e.level);
        } else if (e.type === 'crown') {
          /* Thrown at its age at `to`, so it is where it was. */
          fx.play(e.p, e.from, e.level, to - e.t);
        } else if (e.type === 'boom') {
          booms.play(e.p, e.level * SIZE_MAX, to - e.t);
          /* From where it went off, as live (src/render/world-audio.js
           * boom, main.js warBoomAt's level); without the world's voice,
           * the mix's own boom at its distance. */
          if (playing && worldBoom && worldBoom(e.p, Math.min(1, 0.35 + 0.2 * e.level * SIZE_MAX) * Math.min(1, speed))) {
            boomsRung += 1;
          } else if (playing && audio && typeof audio.boom === 'function') {
            camAt[0] = camera.position.x - e.p[0];
            camAt[1] = camera.position.y - e.p[1];
            camAt[2] = camera.position.z - e.p[2];
            audio.boom(Math.min(1, e.level * 2.5) * Math.min(1, speed), Math.hypot(camAt[0], camAt[1], camAt[2]));
            boomsRung += 1;
          }
        } else if (!playing || !audio) {
          continue;
        } else if (e.type === 'schwing' && typeof audio.schwing === 'function') {
          audio.schwing(e.level * Math.min(1, speed));
          schwings += 1;
        } else if (e.type === 'coin' && typeof audio.coin === 'function') {
          audio.coin(e.level * Math.min(1, speed));
          coins += 1;
        }
      }
    }
    layer.view(camera, viewHeight);
    const row = samplePaper(paper, n, k, a, sample);
    for (let j = 0; j < row.count; j += 1) {
      const r = row.ribbons[j];
      layer.draw(r.key, r.cols.subarray(0, r.colsLen), r.id, r.x, r.n, row.t, r.free, r.anchored ? r.anchor : null);
    }
    last = row;
    layer.update(forward ? to - from : 0);
    if (fx) {
      fx.frame(0, camera, target);
    }
    if (booms) {
      booms.update(forward ? to - from : 0);
    }
  }

  function dispose() {
    layer.clear();
    layer.group.removeFromParent();
    if (fx) {
      fx.dispose();
    }
    if (booms) {
      booms.dispose();
    }
  }

  return {
    frame,
    dispose,
    /* For the harness: what this frame drew. Each ribbon's seat, chain,
     * node count, tow point and nodes; each seat's colours as drawn; the
     * bursts and glints thrown; the SCHWINGs rung; the crown's burst and
     * the coins rung. */
    summary() {
      const ribbons = [];
      for (let j = 0; last && j < last.count; j += 1) {
        const r = last.ribbons[j];
        ribbons.push({
          key: r.key, id: r.id, n: r.n, free: r.free,
          anchor: r.anchored ? Array.from(r.anchor) : null,
          nodes: Array.from({ length: r.n }, (_, i) => [r.x[i * 3], r.x[i * 3 + 1], r.x[i * 3 + 2]]),
        });
      }
      const keys = [...new Set(ribbons.map((r) => r.key))];
      return {
        ribbons,
        colours: Object.fromEntries(keys.map((key) => [key, layer.colours(key)])),
        effects: layer.effects(),
        schwings,
        crown: fx ? fx.stats() : null,
        coins,
        booms: booms ? { ...booms.stats(), rung: boomsRung } : null,
      };
    },
  };
}
