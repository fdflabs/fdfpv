# What the swiss2 views cost the GPU

Round 9 of the photorealism loop (docs/SWISS2-LOOP.md) measured what
each fixed view costs, pass by pass, set budgets, and fixed what the
round owned. This file is the record; `scripts/swiss2-perf.js` takes
the numbers again:

    SIM_GPU=1 node scripts/swiss2-perf.js OUT_DIR --objects

## How it is measured

The views' own frame time (`scripts/swiss2-views.js`) is the time between
animation frames, capped by the display at 16.7 ms: a view that costs
4 ms and one that costs 16 both read 16.7, and one that costs 17 reads
33. It can show a drop and nothing else. swiss2-perf.js times the GPU
itself with WebGL's timer queries (EXT_disjoint_timer_query_webgl2):
it switches the shell's own draw off, draws each view forty frames back
to back in one task with the clocks held, and wraps a query round each
shadow cascade, the lake's mirror, the scene, every post pass and, with
`--objects`, every mesh's own draws. Three repeats per view. CPU is the
main thread's time to submit one frame (the valley's per frame update
and the composer), after `gl.finish()`.

Machine: RTX 3060 Ti (8 GB, driver 595.84, the x16 card, ANGLE on OpenGL ES
3.2, headless Chrome 151), 20 threads, 60 GB. The page is 1600 by 900
at a device pixel ratio of 1, as the views are shot; High and Medium
render at 1600 by 900, Low at 0.85 of it (quality.js).

### The load, and which numbers to trust

The card is not this page's alone. Throughout both runs (2026-09-25,
05:48 to 05:58 UTC) nvidia-smi showed the GPU the headless Chrome draws
on at 100 %: the owner's desktop Chrome drawing about 70 % of it and
another agent's headless page about 28 % at the one sample taken
(nvidia-smi pmon), with the
host's load average 13 to 16. Chrome cannot be moved to the idle second
card from the command line here (`--render-node-override` and the PRIME
variables were tried; the draw stayed on the busy card). A timer query
counts the time the GPU spends on the other contexts while it is open,
so everything here is inflated by the desktop, by an amount that
changes from frame to frame.

Two numbers per view, bracketing the truth:

- **Floor**: every mesh's draws and every pass timed as its own short
  segment, each segment's least time over 120 frames, summed. A short
  segment is often drawn with none of the desktop's work in it, so this
  is the frame's own cost with the least contamination this box allows.
  It is a lower bound: the least of 120 noisy samples reads a little
  low. Repeated, it moves by about 0.5 ms on Medium and Low and up to
  2 ms on High (cruise 7.3 to 9.5 between two runs of the same code),
  which is the resolution of any before and after here.
- **Under load**: the median whole frame, as the GPU delivered it while
  the desktop was drawing. An upper bound for an idle machine, and what
  this box does today.

The budgets are judged on the floor. Neither number is an idle card's;
an idle card's frame lies between them.

## Budgets

GPU time per frame, every fixed view, RTX 3060 Ti at 1600 by 900:

- High under 12 ms, leaving a third of a 60 Hz frame for the main
  thread, the compositor and whatever else draws;
- Medium under 8 ms;
- Low under 5 ms.

On the floor all three are met in every view (the worst: High 9.5 in
cruise, Medium 6.3 in cruise and craft-chase, Low 4.1 in vista-high).
Under today's load none is: High 12 to 27 ms, Medium 10 to 17, Low 5 to
9, and that is the desktop's GPU time as much as the valley's. The
frame at the display cap in round 8, and 33 ms in some views, is this:
a frame of 8 to 10 ms of the valley's own work shares a card that is
already busy, and misses the vsync.

## Before and after

Before is main at c508a20 with only the measuring hook; after is this
branch. Milliseconds of GPU per frame.

#### High (budget 12 ms)

| View | Floor before | Floor after | Under load before | Under load after | CPU after |
| --- | --- | --- | --- | --- | --- |
| strip | 10.7 | 8.9 | 18.1 | 17.9 | 2.4 |
| vista-high | 8.4 | 9.3 | 18.2 | 19.2 | 2.2 |
| cruise | 7.3 | 9.5 | 16.7 | 16.5 | 2.0 |
| village-20m | 5.4 | 5.2 | 15.1 | 15.0 | 2.0 |
| square-eye | 6.9 | 6.6 | 16.9 | 18.0 | 1.9 |
| meadow-eye | 10.6 | 8.6 | 23.6 | 26.5 | 2.7 |
| east-wall | 5.1 | 6.2 | 12.3 | 12.3 | 1.2 |
| lake-shore | 10.6 | 7.2 | 27.6 | 18.4 | 1.7 |
| lake-high | 5.8 | 6.9 | 16.2 | 14.7 | 1.8 |
| waterfall | 7.1 | 6.4 | 17.5 | 16.6 | 1.4 |
| into-sun | 8.0 | 7.3 | 23.0 | 18.3 | 2.3 |
| farm-low | 7.6 | 7.0 | 17.4 | 17.4 | 1.5 |
| lake-edge | 6.7 | 6.1 | 17.8 | 18.1 | 1.8 |
| craft-chase | 9.1 | 8.6 | 20.0 | 19.3 | 1.5 |

#### Medium (budget 8 ms)

| View | Floor before | Floor after | Under load before | Under load after | CPU after |
| --- | --- | --- | --- | --- | --- |
| strip | 6.4 | 6.0 | 15.7 | 15.1 | 1.5 |
| vista-high | 6.3 | 6.0 | 23.6 | 16.0 | 1.2 |
| cruise | 5.7 | 6.3 | 13.8 | 13.2 | 0.9 |
| village-20m | 4.1 | 3.9 | 11.9 | 11.4 | 2.2 |
| square-eye | 4.4 | 4.1 | 14.2 | 13.6 | 1.7 |
| meadow-eye | 6.5 | 5.4 | 18.9 | 16.8 | 1.7 |
| east-wall | 3.8 | 4.5 | 11.6 | 10.4 | 0.6 |
| lake-shore | 5.9 | 5.1 | 17.5 | 14.5 | 1.4 |
| lake-high | 4.1 | 4.0 | 12.2 | 10.9 | 1.3 |
| waterfall | 4.4 | 4.1 | 12.3 | 11.0 | 0.8 |
| into-sun | 4.2 | 4.1 | 12.1 | 10.1 | 2.5 |
| farm-low | 5.0 | 4.5 | 12.6 | 11.4 | 0.9 |
| lake-edge | 4.7 | 4.3 | 14.7 | 13.6 | 1.0 |
| craft-chase | 6.7 | 6.3 | 14.1 | 13.9 | 1.2 |

#### Low (budget 5 ms)

| View | Floor before | Floor after | Under load before | Under load after | CPU after |
| --- | --- | --- | --- | --- | --- |
| strip | 3.8 | 3.6 | 5.9 | 5.7 | 0.5 |
| vista-high | 4.3 | 4.1 | 8.0 | 8.0 | 1.2 |
| cruise | 3.9 | 3.8 | 7.6 | 7.6 | 0.6 |
| village-20m | 2.8 | 2.6 | 5.2 | 4.8 | 1.3 |
| square-eye | 2.6 | 2.5 | 6.6 | 8.8 | 1.3 |
| meadow-eye | 2.7 | 2.6 | 4.8 | 5.9 | 0.6 |
| east-wall | 2.4 | 2.4 | 4.3 | 5.5 | 0.4 |
| lake-shore | 2.5 | 2.5 | 4.6 | 6.0 | 0.5 |
| lake-high | 2.5 | 2.5 | 4.8 | 5.5 | 0.5 |
| waterfall | 2.6 | 2.5 | 4.8 | 7.2 | 0.5 |
| into-sun | 2.6 | 2.5 | 4.7 | 6.0 | 0.7 |
| farm-low | 2.5 | 2.5 | 4.6 | 5.8 | 0.4 |
| lake-edge | 2.3 | 2.3 | 4.9 | 6.0 | 0.4 |
| craft-chase | 3.9 | 3.8 | 6.4 | 7.7 | 0.5 |

## By part, after

The least of each part's time over 120 frames. The parts are whole
passes here, so the long scene pass is the one the desktop lands in
most: its figure is well over its share of the floor above.

#### High, after, by part (least over 120 frames, ms)

| View | shadow0 | shadow1 | mirror | scene | ao | clouds | meter | bloom | photo | fxaa | other |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| strip | 0.12 | 0.31 | 0.00 | 9.81 | 0.09 | 0.86 | 0.02 | 0.16 | 0.17 | 0.05 | 0.10 |
| vista-high | 0.16 | 0.37 | 0.00 | 9.30 | 0.01 | 1.23 | 0.02 | 0.15 | 0.17 | 0.05 | 0.10 |
| cruise | 0.10 | 0.28 | 0.00 | 7.84 | 0.01 | 1.25 | 0.02 | 0.15 | 0.17 | 0.05 | 0.10 |
| village-20m | 0.15 | 0.34 | 0.00 | 7.58 | 0.10 | 0.21 | 0.02 | 0.15 | 0.17 | 0.06 | 0.10 |
| square-eye | 0.15 | 0.37 | 0.00 | 8.54 | 0.11 | 0.56 | 0.02 | 0.15 | 0.17 | 0.06 | 0.10 |
| meadow-eye | 0.11 | 0.40 | 2.36 | 9.62 | 0.11 | 0.69 | 0.02 | 0.16 | 0.17 | 0.06 | 0.10 |
| east-wall | 0.08 | 0.23 | 0.00 | 4.88 | 0.03 | 0.69 | 0.70 | 0.14 | 0.17 | 0.04 | 0.10 |
| lake-shore | 0.07 | 0.25 | 0.80 | 8.57 | 0.10 | 0.77 | 0.01 | 0.16 | 0.17 | 0.06 | 0.10 |
| lake-high | 0.07 | 0.30 | 2.09 | 4.20 | 0.01 | 0.98 | 0.02 | 0.15 | 0.17 | 0.05 | 0.10 |
| waterfall | 0.18 | 0.29 | 0.00 | 7.53 | 0.07 | 1.25 | 0.02 | 0.16 | 0.17 | 0.05 | 0.10 |
| into-sun | 0.09 | 0.31 | 1.94 | 6.82 | 0.02 | 1.12 | 0.02 | 0.15 | 0.17 | 0.04 | 0.10 |
| farm-low | 0.12 | 0.40 | 0.00 | 8.76 | 0.11 | 0.38 | 0.02 | 0.16 | 0.17 | 0.06 | 0.10 |
| lake-edge | 0.07 | 0.24 | 0.65 | 5.70 | 0.10 | 0.75 | 0.02 | 0.16 | 0.17 | 0.06 | 0.10 |
| craft-chase | 0.10 | 0.32 | 0.00 | 10.27 | 0.14 | 0.21 | 0.02 | 0.16 | 0.17 | 0.06 | 0.10 |

#### Medium, after, by part (least over 120 frames, ms)

| View | shadow0 | shadow1 | mirror | scene | ao | clouds | meter | bloom | photo | fxaa | other |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| strip | 0.10 | 0.00 | 0.00 | 8.31 | 0.09 | 0.46 | 0.02 | 0.00 | 0.16 | 0.05 | 0.10 |
| vista-high | 0.10 | 0.00 | 0.00 | 9.50 | 0.01 | 0.62 | 0.02 | 0.00 | 0.16 | 0.05 | 0.10 |
| cruise | 0.08 | 0.00 | 0.00 | 6.05 | 0.01 | 0.64 | 0.02 | 0.00 | 0.15 | 0.05 | 0.09 |
| village-20m | 0.11 | 0.00 | 0.00 | 4.22 | 0.10 | 0.11 | 0.02 | 0.00 | 0.16 | 0.06 | 0.10 |
| square-eye | 0.11 | 0.00 | 0.00 | 4.91 | 0.10 | 0.29 | 0.02 | 0.00 | 0.16 | 0.06 | 0.09 |
| meadow-eye | 0.09 | 0.00 | 0.60 | 7.53 | 0.11 | 0.35 | 0.02 | 0.00 | 0.16 | 0.06 | 0.10 |
| east-wall | 0.06 | 0.00 | 0.00 | 4.48 | 0.03 | 0.36 | 0.02 | 0.00 | 0.16 | 0.04 | 0.10 |
| lake-shore | 0.06 | 0.00 | 0.49 | 5.53 | 0.09 | 0.40 | 0.02 | 0.00 | 0.16 | 0.06 | 0.10 |
| lake-high | 0.06 | 0.00 | 0.55 | 3.89 | 0.01 | 0.50 | 1.23 | 0.00 | 0.16 | 0.05 | 0.10 |
| waterfall | 0.09 | 0.00 | 0.00 | 4.53 | 0.06 | 0.64 | 0.02 | 0.00 | 0.16 | 0.05 | 0.10 |
| into-sun | 0.08 | 0.00 | 0.48 | 3.56 | 0.02 | 0.57 | 0.02 | 0.00 | 0.15 | 0.04 | 0.10 |
| farm-low | 0.09 | 0.00 | 0.00 | 8.10 | 0.11 | 0.19 | 0.02 | 0.00 | 0.15 | 0.06 | 0.10 |
| lake-edge | 0.06 | 0.00 | 0.39 | 4.88 | 0.10 | 0.38 | 0.02 | 0.00 | 0.16 | 0.06 | 0.10 |
| craft-chase | 0.09 | 0.00 | 0.00 | 7.31 | 0.14 | 0.11 | 0.02 | 0.00 | 0.16 | 0.06 | 0.10 |

#### Low, after, by part (least over 120 frames, ms)

| View | shadow0 | shadow1 | mirror | scene | ao | clouds | meter | bloom | photo | fxaa | other |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| strip | 0.00 | 0.00 | 0.00 | 3.96 | 0.00 | 0.19 | 0.00 | 0.00 | 0.10 | 0.04 | 0.09 |
| vista-high | 0.00 | 0.00 | 0.00 | 5.18 | 0.00 | 0.27 | 0.00 | 0.00 | 0.10 | 0.04 | 0.09 |
| cruise | 0.00 | 0.00 | 0.00 | 4.96 | 0.00 | 0.28 | 0.00 | 0.00 | 0.10 | 0.04 | 0.09 |
| village-20m | 0.00 | 0.00 | 0.00 | 3.74 | 0.00 | 0.05 | 0.00 | 0.00 | 0.10 | 0.05 | 0.09 |
| square-eye | 0.00 | 0.00 | 0.00 | 3.91 | 0.00 | 0.14 | 0.00 | 0.00 | 0.10 | 0.05 | 0.09 |
| meadow-eye | 0.00 | 0.00 | 0.00 | 4.05 | 0.00 | 0.16 | 0.00 | 0.00 | 0.10 | 0.04 | 0.09 |
| east-wall | 0.00 | 0.00 | 0.00 | 3.69 | 0.00 | 0.14 | 0.00 | 0.00 | 0.10 | 0.03 | 0.09 |
| lake-shore | 0.00 | 0.00 | 0.00 | 3.89 | 0.00 | 0.16 | 0.00 | 0.00 | 0.10 | 0.04 | 0.09 |
| lake-high | 0.00 | 0.00 | 0.00 | 3.91 | 0.00 | 0.22 | 0.00 | 0.00 | 0.10 | 0.04 | 0.09 |
| waterfall | 0.00 | 0.00 | 0.00 | 3.95 | 0.00 | 0.28 | 0.00 | 0.00 | 0.10 | 0.04 | 0.09 |
| into-sun | 0.00 | 0.00 | 0.00 | 3.90 | 0.00 | 0.25 | 0.00 | 0.00 | 0.10 | 0.03 | 0.09 |
| farm-low | 0.00 | 0.00 | 0.00 | 3.96 | 0.00 | 0.08 | 0.00 | 0.00 | 0.10 | 0.04 | 0.09 |
| lake-edge | 0.00 | 0.00 | 0.00 | 3.46 | 0.00 | 0.17 | 0.00 | 0.00 | 0.10 | 0.04 | 0.09 |
| craft-chase | 0.00 | 0.00 | 0.00 | 5.20 | 0.00 | 0.05 | 0.00 | 0.00 | 0.10 | 0.04 | 0.09 |

## What changed, and what it bought

Measured per mesh at High before any change (the floors above cannot
resolve half a millisecond, the per mesh times can):

- **The clouds' shadow** (light.js). Every lit fragment worked out the
  deck's three octaves of noise and the low bank's three more. Baked
  once a frame into a 1024 texture over the planes where the sun's rays
  meet the two layers (0.1 ms, the `other` column), and read with one
  or two taps: the ground's draws went from 3.01 to 2.86 ms in strip and
  the grass's from 1.03 to 0.87, about 0.3 ms net a High frame and the
  same share on Medium and Low. The picture is the same.
- **The lake's mirror** (swiss2.js). The two grass layers round the
  camera were drawn into the mirror: 0.62 and 0.50 ms of it at
  meadow-eye, 0.60 and 0.21 at lake-shore, 0.48 at into-sun. They are
  hidden for the mirror's draw now; the mirror's floor went 2.1 to 0.9
  ms at meadow-eye and 1.4 to 0.5 at lake-shore on High, 0.9 to 0.4 and
  0.7 to 0.3 on Medium. The reflections are the same by eye.

What the round found cheap and left alone, with the numbers:

- The shadow cascades: 0.07 to 0.18 ms near and 0.23 to 0.41 ms far on
  High, 0.06 to 0.11 on Medium. The forest casts only its open grown
  trees into them already.
- The post chain: occlusion 0.01 to 0.14, bloom 0.16, the photographic
  pass 0.17, FXAA 0.06, the meter 0.02 (its occasional 0.7 to 1.3 is
  the first read of the colour target, which moves to whichever pass
  reads it first).
- The cloud march: 0.2 to 1.3 ms on High, half that on Medium, up to
  0.3 on Low. Fewer steps would band the bank; at a tenth of the frame it was
  not worth a visible change.

## What costs the most, and who owns it

The scene pass is most of every frame, and nearly all of it is drawn by
files this round did not own. Per mesh at High, after (least over 120
frames; `max` is the view where it costs most):

| What | High max | High mean | Medium max | Low max | Owner |
| --- | --- | --- | --- | --- | --- |
| the ground (`ground`, ground.js's splat) | 3.29 (vista-high) | 2.55 | 3.14 | 2.39 | near views |
| the strip's quad (the unnamed 160 m Mesh at the origin, ground.js's splat through look.js's `strip`) | 2.23 (craft-chase) | 0.23 | 1.83 | 1.27 | near views |
| the near grass (`swiss2-vegetation/swiss2-grass`) | 1.74 (meadow-eye) | 0.66 | 0.86 | not drawn | near views |
| the impostor forest (`swiss2-impostors`) | 1.57 (square-eye) | 0.56 | 0.73 | 0.27 | near views |
| the cliffs (`swiss2-cliffs`) | 0.71 (waterfall) | 0.23 | 0.60 | 0.47 | near views |
| the meadow layer (`swiss2-meadow`) | 0.66 (strip) | 0.22 | 0.22 | not drawn | near views |
| the range beyond (`far-range`) | 0.58 (lake-shore) | 0.27 | 0.53 | 0.39 | near views |
| broadleaf crowns at the fall's foot (`maple-mid`, `beech-open-mid`) | 0.67 and 0.45 (waterfall) | | 0.11 | | near views |
| the lake's mirror at half resolution (water/index.js WATER_TIERS) | 0.9 floor, 2.4 whole pass (meadow-eye) | | 0.44 | none | near views (water/) |

The ground's splat is the biggest single cost in every view and on every
preset: a quarter to a third of the frame. The strip's quad costs as
much as the whole of the rest of the ground when the camera is on the
strip. `Group/village-insulator` showed 1.24 ms in cruise alone and
nearly nothing elsewhere; a per draw query can take on the tail of the
draw before it, so treat a lone number like that as unconfirmed until
it is measured again.

## What the brief had wrong

- The shadow cascades, the mirror's resolution and the post chain were
  named as likely big costs. The cascades and the post chain are small
  (above); the mirror is real, and its resolution is set in
  water/index.js, a file the near views agent owns, so it is reported
  here rather than changed.
- `page.js` is `tests/lib/page.js`, and it has no switch for a render
  node or vsync; frames were drawn back to back in one task instead,
  which needs neither.
- The 33 ms frames are mostly the shared card, not the valley alone.
