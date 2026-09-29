/*
 * stream.js: the map's streamed collider set, refilled round the pilot
 * from every part that streams (docs/ITAIPU-PLAN.md sections 7 and 9).
 *
 * A Colliders has ONE streamed set and one refill at a time
 * (src/game/collide.js streamFill: a second streamFill kills the first).
 * The town's walls and wires and the vegetation's near trees are both in
 * it, so neither part may refill it alone: a part that streams returns
 *
 *   stream(fill, x, z) -> onSwap(offset) | undefined
 *
 * from buildPart, adds to `fill` what it keeps round (x, z) (each part
 * its own radius), and gets `onSwap(offset)` called on the frame the set
 * is swapped in, where offset (colliders.staticCount) turns an index it
 * took from the fill into the collider's index in the map. Until then the
 * set before is the one in force.
 *
 * A refill starts when the pilot is MOVE from the last one's centre and
 * is swapped in over the frames after, one step (collide.js
 * STREAM_SLICE, measured under 2 ms) a frame. Each part keeps everything
 * within its radius, and the parts' radii (600 m and 1 000 m) are far
 * more than MOVE, so whatever the craft can reach is in the set before
 * and the set after alike: which of the two is in force on a given step
 * never changes what the craft meets.
 *
 * Before each step the roofs' cover is lifted (roofs.js cover, from under
 * every roof): the step that swaps moves every streamed index, and the
 * pass flags cover set on the walls under a roof name other walls after
 * it. The obstacle pass sets the cover again from the craft before its
 * next sweep (src/main.js), on the new indices.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/* Section 7: the set is rebuilt when the pilot has moved 400 m. */
export const MOVE = 400;

/*
 * `colliders` built, `parts` the parts' objects (those without `stream`
 * are passed over), `uncover()` lifts the roofs' cover. `now()` is a
 * clock for the statistics only.
 */
export function makeStream({ colliders, parts, uncover, now = () => performance.now() }) {
  const streamers = parts.filter((p) => typeof p.stream === 'function');
  let fill = null;
  let swaps = [];
  let cx = NaN;
  let cz = NaN;
  const stats = {
    refills: 0, adds: 0, addMs: 0, worstAddMs: 0, steps: 0, worstStepMs: 0, stepsLast: 0,
  };

  function start(x, z) {
    const t0 = now();
    fill = colliders.streamFill();
    swaps = [];
    for (const p of streamers) {
      const onSwap = p.stream(fill, x, z);
      if (onSwap) {
        swaps.push(onSwap);
      }
    }
    cx = x;
    cz = z;
    stats.refills += 1;
    stats.adds = fill.ax.length;
    stats.addMs = now() - t0;
    stats.worstAddMs = Math.max(stats.worstAddMs, stats.addMs);
    stats.stepsLast = 0;
  }

  /* One slice; true when the set was swapped in. */
  function step() {
    const t0 = now();
    uncover();
    const done = fill.step();
    stats.steps += 1;
    stats.stepsLast += 1;
    if (done) {
      fill = null;
      for (const onSwap of swaps) {
        onSwap(colliders.staticCount);
      }
      swaps = [];
    }
    stats.worstStepMs = Math.max(stats.worstStepMs, now() - t0);
    return done;
  }

  /* Where on the square (every `pitch` metres to `half` either way of
   * the origin) the parts would stream the most, by counting their adds. */
  function heaviest(half, pitch) {
    let best = [0, 0];
    let most = -1;
    for (let x = -half; x <= half; x += pitch) {
      for (let z = -half; z <= half; z += pitch) {
        const count = {
          n: 0,
          add() { count.n += 1; return count; },
          addPost() { count.n += 1; return count; },
          addSphere() { count.n += 1; return count; },
          addBox() { count.n += 1; return count.n - 1; },
        };
        for (const p of streamers) {
          p.stream(count, x, z);
        }
        if (count.n > most) {
          most = count.n;
          best = [x, z];
        }
      }
    }
    stats.heaviest = { at: best, colliders: most };
    return best;
  }

  const run = () => {
    while (!step()) {
      /* To the end: the loading bar is up. */
    }
  };

  return {
    /*
     * At load: a set round the heaviest centre on the square first, whole,
     * then the first real one round (x, z). A refill bigger than any before
     * grows the store, which copies the static set (collide.js place): one
     * step of several milliseconds, which belongs here, with the loading
     * bar up, and not in flight. Not counted in the per frame worst.
     */
    load(x, z, square) {
      const [hx, hz] = heaviest(square.half, square.pitch);
      start(hx, hz);
      run();
      start(x, z);
      run();
      stats.worstStepMs = 0;
    },
    /* Once a frame, with the pilot. */
    update(x, z) {
      if (fill) {
        step();
        return;
      }
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz >= MOVE * MOVE) {
        start(x, z);
        step();
      }
    },
    /* A refill round (x, z) now, run to the end: for the checks. */
    refill(x, z) {
      start(x, z);
      run();
    },
    centre: () => [cx, cz],
    busy: () => fill !== null,
    stats: () => ({
      ...stats, centre: [cx, cz], streamed: colliders.streamCount, gen: colliders.streamGen, streamers: streamers.length,
    }),
  };
}
