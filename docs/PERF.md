# What a frame of play costs

The measuring stick every performance change is judged by. The owner's
target, 2026-10-05: **90 fps, an 11.1 ms frame**. `scripts/perf-play.js`
takes the numbers:

    SIM_GPU=1 npm run perf -- OUT_DIR [--scenarios=itaipu-war,swiss-low,wing-cruise]
        [--seconds=30] [--repeat=2] [--preset=high] [--pace=free|raf] [--cap=90]
        [--mode=quality|balanced|performance] [--objects] [--alloc] [--gctrace] [--buffers]

`--alloc`, `--gctrace` and `--buffers` say who allocates, which collector
paused and who asks for each buffer upload (P8 below); each costs time of
its own, so their frame times are not a baseline.

`--scenarios=itaipu-stream` adds Itaipu flown flat out across its town
(P6 below); it is not in the default list.

`--mode=quality` holds the resolution at the preset's, so dynamic
resolution cannot hide a cost between a before and an after; P3's
numbers below are taken with it. `--objects` splits every draw by mesh,
a diagnostic whose own queries cost time.

On this machine run it as the baseline below was run, one browser, under
a memory ceiling, with the temp dir off the tmpfs:

    TMPDIR=$HOME/.cache/fdfpv-lead-tmp SIM_GPU=1 systemd-run --user --scope -p MemoryMax=8G \
        node scripts/perf-play.js OUT_DIR --repeat=2 --seconds=30

It prints a table per run and writes OUT_DIR/perf-play.json with every
frame. The frames stay out of the repository; the numbers worth keeping
go here.

## How it is measured

**Real play, not parked views.** scripts/swiss2-perf.js and
scripts/itaipu-views.js time a parked camera with the clocks held. This
boots the real shell, flies a scripted pilot and times every frame:

| Scenario | Where | Craft | Path |
| --- | --- | --- | --- |
| itaipu-war | Itaipu, Defend the Paraná mission 1, First Light, live, alone in a private room on a rooms server the script starts | 7 inch (avionics HUD on) | 30 m over the ground, nose down, slow yaw circle; ten explosions 150 m ahead every ten seconds (`__warFxBurst`) on top of whatever the mission brings |
| swiss-low | Swiss valley | 7 inch | 8 m over the ground, nose down, slow yaw circle, about 11 m/s |
| wing-cruise | Swiss valley | Skyhunter, thrown at 60 m as scripts/crashcam-e2e.js throws it | 40 m over the ground, wings level, full throttle, about 23 m/s |

The pilot runs in the page before each frame, outside the frame's timing,
and flies on feedback (height over `__heightAt`, attitude from
`__craftState`), so the path does not depend on the frame rate. It is the
same path every run, not a bit identical one: the stick reaches the plant
on wall clock frames. Every run reports metres flown, the height it ended
at and crashes; the baseline had none.

**Uncapped.** Headless Chrome hands `requestAnimationFrame` a 60 Hz beat
that no flag removed (`--disable-gpu-vsync`, `--disable-frame-rate-limit`,
tried 2026-10-05: still 16.7 ms). For the recorded window the script
replaces `requestAnimationFrame` with a scheduler that runs the next frame
as soon as the last is done, held back only by a fence: a frame waits for
the GPU to finish the frame two before it, as a two deep swap chain does.
`--pace=raf` keeps the browser's beat instead.

**Measured from outside the shell.** No file in src/ carries a hook for
this. A script seeded before the shell's first line wraps
`WebAssembly.instantiate` (time inside sim.wasm), three's
`EffectComposer.render` and the shell renderer's `render` (render submit),
every composer pass and the shadow map (GPU segments), and
`requestAnimationFrame` (the frame). Per frame:

- **physics**: time inside sim.wasm's exports: the plant, Betaflight, the
  crash and water code;
- **scene**: the rest of the shell's frame callback: input, the map's
  update, the war, HUD, audio, streaming, the avionics sensor view;
- **render**: three.js walking the scene and issuing WebGL calls;
- **gpu wait**: free running, the wait for the frame two back;
- **other**: the interval less all of the above (other tasks, GC);
- **GPU**: WebGL timer queries as swiss2-perf.js takes them, one segment
  per composer pass, `shadow`, one per renderer.render outside the
  composer named `draw <src file>` after its caller
  (`draw maps/swiss2/water/lake` is the lake's mirror,
  `draw render/sensorview` the avionics sensor view's scene draws and
  full screen passes, `draw maps/itaipu/look/sky` Itaipu's sky cube,
  redrawn a band at a time). Itaipu's mirror is drawn from the scene's
  onBeforeRender, inside the composer's scene pass, so it is counted in
  `scene`. `other` is the rest (P3 split these; the baseline below
  lumped them all into `other`);
- **draw calls and triangles**: the renderer's own counts after the frame;
- **long tasks**: PerformanceObserver `longtask`;
- **GC**: the JS heap (`performance.memory`) falling between two frames.
  `measureUserAgentSpecificMemory` is unavailable: the page is not cross
  origin isolated;
- **where the main thread went**: a DevTools sampled profile over the
  window, self time by function and charged to the nearest src/ caller,
  in ms per second of play.

1% low fps is 1000 over the mean of the slowest 1% of frame intervals.
Headroom is 11.1 ms less the frame time.

## Machine and contamination

20 threads, 60 GB, two RTX 3060 Ti (driver 595), headless Chrome on ANGLE
over OpenGL ES 3.2, 1600 by 900 at a device pixel ratio of 1, preset
High, 2026-10-05 on main at 6a23782e.

**Earlier runs were contaminated.** Four headless Chromes leaked by an earlier test run
(orphaned, profiles under ~/.cache/fdfpv-lead-tmp/sim-page-*) had held
GPU 0 at about 98 % for some four hours. While they ran, this script's
first baseline read 48 to 101 ms a frame, with the sensor readback below
blocking 750 to 850 ms of every second. They were killed (by the
coordinator, by PID) and GPU 0 fell to about 5 %. The baseline below was
taken after that: GPU 0 at 28 to 94 % during the runs (the owner's
desktop and this run), host load average 1.7 to 4.3. The contaminated
numbers are not kept here; they measured the leak.

**GPU 1 could not be used.** About twenty minutes went into it:
`--use-angle=vulkan` (with and without `__NV_PRIME_RENDER_OFFLOAD=1`,
`__VK_LAYER_NV_optimus=NVIDIA_only`, `MESA_VK_DEVICE_SELECT`) gives no
WebGL2 context at all; `--use-angle=gl-egl` and plain `gl` stay on GPU 0
(a fullscreen shader loop did not move GPU 1's utilisation). DRI_PRIME is
Mesa only. Both cards report the same PCI id (10de:2486), so device
select by id cannot tell them apart. The card is still shared with the
owner's desktop, so:

- **frame ms** is what this box does with the desktop up, an upper bound
  for an idle card;
- **GPU floor** is each GPU segment's tenth percentile, summed, a lower
  bound on the frame's own GPU cost;
- each scenario was flown twice and the run with the lower mean frame is
  reported; the two runs agreed within 1.4 ms mean in every scenario.

**A run must leave no browser behind.** perf-play.js closes its page
(and the rooms server) in a `finally` and on SIGINT and SIGTERM; after
the baseline no Chrome with this run's profile was left. Check with
`pgrep -af sim-page-` before believing a GPU number.

## Baseline, main at 6a23782e, High, uncapped, clean card

Best of two 30 s runs per scenario.

| Scenario | Frames | Avg ms | p50 | p95 | p99 | 1% low fps | > 11.1 ms | > 16.7 ms | > 33.3 ms | Headroom vs 11.1 (avg / p95) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| itaipu-war | 5832 | 5.15 | 5.0 | 7.0 | 8.2 | 107.3 | 4 | 0 | 0 | +5.97 / +4.11 |
| swiss-low | 1596 | 18.81 | 16.9 | 35.7 | 42.6 | 21.1 | 1231 | 820 | 132 | -7.70 / -24.59 |
| wing-cruise | 3816 | 7.86 | 7.3 | 15.0 | 16.2 | 53.4 | 1109 | 30 | 1 | +3.25 / -3.89 |

The second runs: itaipu-war 5.82 ms avg (29 frames over 11.1, p95 8.6),
swiss-low 20.14 (p95 33.9), wing-cruise 7.89 (p95 14.8).

| Scenario | Physics | Scene | Render submit | GPU wait | Other | GPU avg | GPU p95 | GPU floor | Calls avg / max | Tris avg / max (M) | Long tasks | GC (count, MB in 30 s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| itaipu-war | 0.03 | 3.01 | 1.69 | 0.00 | 0.42 | 3.44 | 4.39 | 2.05 | 244 / 297 | 2.31 / 3.51 | 0 | 62, 1747 |
| swiss-low | 0.08 | 7.90 | 2.78 | 7.74 | 0.31 | 14.57 | 20.15 | 8.75 | 319 / 391 | 3.51 / 3.82 | 2, 101 ms | 72, 1772 |
| wing-cruise | 0.02 | 0.59 | 1.15 | 5.96 | 0.14 | 6.97 | 8.03 | 5.94 | 183 / 219 | 1.85 / 2.68 | 1, 68 ms | 66, 1666 |

GPU by segment, mean / tenth percentile, ms:

| Scenario | scene | other (outside composer) | clouds | shadow | meter | bloom | photo | fxaa | ao |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| itaipu-war | 1.41 / 0.91 | 1.42 / 0.70 | 0.01 / 0.01 | 0.23 / 0.10 | 0.01 / 0.01 | 0.12 / 0.10 | 0.16 / 0.15 | 0.05 / 0.04 | 0.04 / 0.03 |
| swiss-low | 6.72 / 5.14 | 5.10 / 2.09 | 0.88 / 0.71 | 0.73 / 0.37 | 0.47 / 0.02 | 0.26 / 0.12 | 0.20 / 0.17 | 0.11 / 0.05 | 0.10 / 0.08 |
| wing-cruise | 4.76 / 4.14 | 0.17 / 0.10 | 0.99 / 0.88 | 0.62 / 0.42 | 0.03 / 0.02 | 0.12 / 0.11 | 0.17 / 0.17 | 0.05 / 0.05 | 0.06 / 0.05 |

(`fxaa` is three's `ShaderPass`. "other" is everything the GPU draws
outside the composer: the avionics sensor view's own scene draws and the
lake's mirror.)

## Top 5 hotspots per scenario, by measured ms per frame

Main thread items come from the sampled profile, ms per second converted
to ms per frame at that run's frame rate.

These are the baseline's, before #426: the sensor view's readback named
first below is gone (#426 made it asynchronous). What a frame costs
after #426 and P3 is in the P3 section at the end.

### itaipu-war (5.15 ms, 194 fps: inside 11.1 ms already)

1. **Avionics sensor view readback, 2.3 ms a frame.** `getBufferSubData`
   from `poll` (src/render/sensorview.js:395): 436 ms of every second. A
   synchronous round trip to the GPU process every frame; most of the
   3.0 ms "scene" bucket.
2. **Render submit, 1.7 ms** (three.js; swiss2/post.js `render`, the
   lake's `render` at src/maps/swiss2/water/lake.js:126).
3. **GPU outside the composer, 1.4 ms** (floor 0.7): the sensor view's
   `drawScene` (sensorview.js:519) and the lake's mirror.
4. **GPU scene pass, 1.4 ms** (floor 0.9).
5. **Garbage: 58 MB a second**, 62 collections in 30 s, and world-audio
   `ambience` (src/render/world-audio.js:332) at 0.23 ms a frame.

Its stutter is in the tail: 4 to 29 frames over 11.1 ms per 30 s, max
13 to 28 ms, which the GC count is the first suspect for.

### swiss-low (18.8 ms, 53 fps: 7.7 ms over budget, the worst)

1. **GPU frame, 14.6 ms mean, 8.8 floor; the main thread waits 7.7 ms a
   frame for it.** GPU bound.
2. **GPU scene pass, 6.7 ms** (floor 5.1): the valley's ground splat,
   grass and forest at 8 m (docs/SWISS2-PERF.md has it per mesh).
3. **Sensor view readback, 6.6 ms a frame** (349 ms per second at 53 fps).
   It waits behind the GPU's queue, so on a GPU bound frame it costs more.
4. **GPU outside the composer, 5.1 ms** (floor 2.1): the sensor view
   drawing the valley again, and the lake's mirror.
5. **Render submit, 2.8 ms**, and 59 MB of garbage a second.

### wing-cruise (7.86 ms, 127 fps mean, p95 15 ms; no avionics HUD on this craft)

1. **GPU bound: 6.0 ms a frame waiting on the GPU**, GPU frame 7.0 ms
   mean, 5.9 floor. The main thread's own work is 1.9 ms.
2. **GPU scene pass, 4.8 ms** (floor 4.1).
3. **Render submit, 1.2 ms**.
4. **GPU cloud march, 1.0 ms**.
5. **GPU shadow maps, 0.6 ms**, and 56 MB of garbage a second. A third of
   the frames are over 11.1 ms (p95 15.0) though the mean has 3.3 ms of
   headroom: the frame time alternates, which is worth a look at the
   frame list in the JSON before anything else.

### Across all three

- **Physics and Betaflight are not the problem**: 0.02 to 0.08 ms a frame.
- **The sensor view** (src/render/sensorview.js) is the biggest single
  main thread cost wherever the avionics HUD is up: a blocking readback
  every frame (2.3 to 6.6 ms) plus a second draw of the world (1.4 to
  5.1 ms of GPU). Making the readback asynchronous, or every few frames,
  and drawing the inset smaller or less often is the first fix.
- **The Swiss valley low down is the one scenario well over budget**, and
  it is GPU bound: the scene pass first, then the sensor view's extra draw.
- **Garbage**: every scenario allocates 55 to 60 MB a second, 2 GC a
  second. The prime suspect for the tail frames once the means fit.

## Proposed budgets (not a CI gate yet)

For 90 fps on an RTX 3060 Ti at 1600 by 900, High, measured by this
script with no stray browser on the card:

- **frame**: p95 under 11.1 ms; at most 5 % of frames over 11.1 ms and
  none over 33.3 ms in a 30 s run; 1% low at least 60 fps. Today
  itaipu-war passes, wing-cruise fails on p95 and the 5 %, swiss-low fails
  all of it;
- **main thread**: physics under 0.5 ms, scene update under 3 ms, render
  submit under 2.5 ms;
- **GPU floor**: under 8 ms for the whole frame; the composer's scene
  pass under 5 ms, everything outside the composer under 1 ms;
- **no synchronous GPU readback on the frame's path**: `getBufferSubData`
  and `readPixels` into client memory under 0.5 ms a frame;
- **long tasks**: none over 50 ms after the first 5 s;
- **garbage**: under 10 MB a second of play.

## Not measured, and why

- **A multi pilot room.** A second pilot is a second Chrome (every
  existing two pilot check, scripts/war-twopage.js among them, opens two),
  and a run here is one browser at a time on this shared box. A peer
  driven from Node over the room socket would make it one browser; that is
  the next piece of work for this script, not done here.
- **GPU 1.** See above.
- **Replays.** The crash cam replays poses, not stick input through the
  plant, so it cannot drive physics; the scripted pilot is used instead.

## P3, throughput: what was measured, what was built, what was not

2026-10-05, after #422, #419 and #426, main at 41978c28. Every number
here is `--mode=quality` (the resolution held at the preset's, scale
1.00, so dynamic resolution cannot hide a cost), High, 1600 by 900,
uncapped, on GPU 0 shared with the owner's desktop and with other
agents' headless pages, which held 20 to 85 % of it during some runs
(nvidia-smi pmon, noted per run in the PRs). The whole frame moves by
several milliseconds between runs on this card (swiss-low 29.5, 22.3
and 20.8 ms in three runs of one tree), so a change is judged on its
own GPU segment, interleaved with the tree before it (A, B, A, B, A, B),
and the whole frame only as the direction it moved.

### Where the GPU frame goes, swiss-low (8 m, avionics HUD on)

GPU frame floor 8.9 to 9.5 ms, mean 11.6 to 15.5. By segment, mean /
tenth percentile, ms, best run of the first baseline:

| scene | sensor view's draws | lake mirror | clouds | shadow (both cascades) | post (ao, meter, bloom, photo, fxaa) | cloud shadow bake |
| --- | --- | --- | --- | --- | --- | --- |
| 6.74 / 5.56 | 4.04 / 2.43 | 1.39 / 0.00 | 0.92 / 0.72 | 0.54 / 0.37 | 1.11 / 0.45 | 0.13 / 0.10 |

By mesh (`--objects`, one 20 s run), the scene pass is the ground's
splat 2.75, the near grass 0.78, the meadow layer 0.59, the impostor
forest 0.36; the sensor view's thermal scene draw is the grass 0.61,
the meadow 0.50, the ground 0.45, the stream 0.39, the cliffs 0.37, the
lake bed 0.27, the impostors 0.21 (2.9 ms of meshes; the rest of the
segment is its full screen passes). The grass and meadow cost nearly as
much in the thermal draw at 640 by 360 as in the scene at 1600 by 900
(1.11 against 1.37 ms): that draw is bound by vertices, not pixels.

Wing-cruise (no HUD, the lake rarely in view): GPU floor 6.45, scene
6.1 to 7.1, clouds 1.0, shadow 0.7. Itaipu-war: frame 6.35 ms, GPU
floor 1.68, inside 11.1 already.

### The brief's five items

1. **Lake mirror: built (#446).** Scissored to the texels the water reads
   (src/maps/swiss2/water/lake.js). The mirror's segment on swiss-low,
   three interleaved pairs: 1.10, 1.14, 1.04 ms a frame before; 0.75,
   0.54, 0.51 after (1.6 ms to 0.72 on the frames it is drawn). What is
   left is the draw's vertices and calls, which a scissor does not cut.
   scripts/perf-mirror-check.js proves the picture bit identical in
   eight views. Itaipu's mirrors are left as they were: its frame is
   5.4 to 6.4 ms, its mirror about 0.4 ms (scripts/itaipu-water-check.js:
   reservoir 0.42, river 0.40, median), and its water reads the
   mirror's alpha (SMEAR), which needs its own proof before it is opted
   in.
2. **Shadow cascade caching: not built.** Both cascades together cost
   0.46 to 0.72 ms a frame (0.36 floor) in every swiss2 scenario and
   0.16 in Itaipu. Caching the far one entirely would buy under 0.3 ms,
   inside this card's run to run noise, and makeSun is shared with
   Itaipu, whose look must not move. docs/SWISS2-PERF.md found the same
   in round 9.
3. **Bloom at half resolution, merged post passes: not built.** three
   r160's UnrealBloomPass already halves its resolution for the bright
   target and every mip. The photographic pass is already the merged
   look; FXAA reads the finished picture and the sharpen pass reads
   FXAA's. The whole post chain is 1.1 ms with no piece over 0.35.
4. **Instancing / BatchedMesh: not built.** 307 to 327 draw calls a
   frame (max 391) and the frame waits on the GPU; render submit is
   2.8 to 3.7 ms of CPU on a 6.5 ms main thread. A CPU saving moves the
   frame only once the GPU is under 11.1 ms.
5. **The sensor view's second draw: proposed, not built.** It is
   src/render/sensorview.js, owned elsewhere. See below.

### Proposal for src/render/sensorview.js (its owner's call)

The default inset is IR white hot, so every frame with the HUD up draws
the scene a second time with every material writing a temperature
(thermal.js), at 640 wide: 2.4 ms floor, 2.9 to 4.0 mean on swiss-low,
the second largest GPU item. It is bound by vertices, so a smaller
target buys nothing. What would:

- **Leave out what the thermal picture cannot see.** The lake bed
  (0.27 ms) is under water that writes its own temperature over it.
  The grass and meadow blades (1.1 ms) are a few pixels at 640 wide and
  stand on ground whose land cover already says vegetation; leaving
  them out changes the thermal texture, so it needs the owner's eye. A
  map could tag such meshes (a layer the sensor's camera masks off).
- **Draw it at the core's own rate.** An uncooled 640 core runs at 30
  or 60 Hz; at 90 fps drawing the thermal source every other frame
  halves the mean, but makes every second frame heavier, which a frame
  budget counts against it. Only worth it with the cap at 60 or below.

### Where the frame stands against 11.1 ms

With #446 applied, the settings' default mode (balanced, so dynamic
resolution was free to act; it held the scale at 1.00 in every run,
since a step that buys nothing is reverted), two 30 s runs each, the
better shown, 2026-10-05 13:08 to 13:17, GPU 0 at 38 to 70 % with this
run on it (the desktop's gnome-shell at up to 70 % in one sample):

| Scenario | Cap | Frames | Avg ms | p50 | p95 | p99 | 1% low fps | > 11.1 ms | > 16.7 ms | GPU avg / floor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| itaipu-war | none | 5566 | 5.39 | 4.9 | 10.4 | 12.9 | 70.0 | 191 | 2 | 3.28 / 1.63 |
| swiss-low | none | 2241 | 13.38 | 13.4 | 16.2 | 19.7 | 41.2 | 1968 | 77 | 11.01 / 8.91 |
| wing-cruise | none | 3519 | 8.52 | 7.9 | 16.3 | 17.2 | 48.8 | 1037 | 73 | 7.48 / 6.17 |
| itaipu-war | 90 | 2898 | 10.35 | 10.2 | 10.3 | 15.2 | 52.3 | 66 | 16 | 3.63 / 1.73 |
| swiss-low | 90 | 2250 | 13.33 | 13.3 | 16.2 | 19.8 | 40.9 | 1910 | 84 | 11.00 / 8.90 |
| wing-cruise | 90 | 2867 | 10.46 | 10.2 | 10.3 | 17.4 | 44.5 | 129 | 31 | 7.85 / 6.22 |

Itaipu and wing-cruise hold 90 with the cap (p95 10.3 ms) and have their
tails to fix (16 to 31 frames over 16.7 ms in 30 s). Swiss-low is still
over: GPU 11.0 ms against 11.1 with a floor of 8.9, and the frame 13.3
because the GPU is shared. What is left there, by size: the scene pass
5.8 (the ground's splat 2.75 of it, ground.js, owned by the near views
work), the sensor view 2.4 (the proposal above), the cloud march 0.9,
the mirror's remaining 0.47, the cascades 0.45.

### What is next

- The ground's splat (src/maps/swiss2/ground.js), the biggest single
  GPU cost in every swiss2 scenario.
- The sensor view's thermal draw, with its owner (above).
- The mirror's remaining 0.47 ms is its vertices: culling the mirror's
  draw to the scissored part of its frustum (a cropped projection)
  would cut its calls, at the price of a picture equal to float
  rounding rather than to the bit.
- The tails: wing-cruise alternates long and short frames (p95 16.3 ms
  uncapped with a 7.9 ms median), worth a look at the frame list before
  anything else.
- A multi pilot room is still not flown by the profiler (see Not
  measured).
- perf-play now exits once its report is written: the war scenario's
  rooms server leaves its room's purge alarm on the event loop after
  stop() (edge/rooms/node.js), which held the process open.

## P3b, the swiss2 ground and grass shaders, the sensor's draw, the wing's tail

2026-10-05, on main at 4ecbaeab (#446 and #447 in). Same machine and
mode as P3: `--mode=quality`, High, 1600 by 900, uncapped, GPU 0 shared
with the desktop and other agents' pages (nvidia-smi pmon load noted per
run below).

### The previous numbers, checked

perf-play swiss-low on main reproduced P3: GPU 11.04 ms a frame, floor
8.93, scene 5.79, sensor view 2.42, clouds 0.89, mirror 0.51, cascades
0.45 (run A1 below, GPU 0 at 5 % before it).

`scripts/perf-ground-check.js --variant=stub-*` timed the ground alone
with one part of the splat left out at a time (parked views, held
clocks): on the valley floor the fields (s2Field and the meadow model
under it) were 1.5 of 3.75 ms, the layer loop 0.7, the sheer faces'
block 0.3 to 0.7 even where there is no face (its registers cost every
pixel), the soft field edges 0.3, the turned second read 0.35, the
relief 0.15 to 0.4.

### What was built

**The splat skips work whose weight is exactly nought** (ground.js).
Much of it was noise worked out only to be multiplied by a weight that is
nought over most of the valley: the airfield's eleven noises everywhere
off the airfield, the stream's damp band, hedges on boundaries the hash
gives none, the village greens, the walls' cliff bands and gullies on
gentle ground, the wash line away from the water, far detail past the
distance that fades it. Each is now behind a branch on its weight. The
grass runs the same field model (MEADOW_GLSL) in its vertex shader, so it
gains too.

**The grass works out a clump's field only when the clump is drawn**
(vegetation/grass.js). A clump grown to nothing past its edge, or a flat
plant past twenty metres, is folded to its root whatever the field says.

**Proof.** `scripts/perf-ground-check.js` draws the scene with this
tree's ground and grass shaders and with main's, in one page, the clocks
held, and compares the scene pass in 32 bit floats. Bit identity is not
reachable once the code round a multiply and an add changes: the
compiler contracts them into one rounding differently. Across all 19
views (swiss2-views.js's 17 and two low over the valley) no pixel's light
moved by 1/255 of itself; the largest move was 0.06 % (lake-edge), the
grass change alone was bit for bit the same, and the waterfall view was
bit for bit the same throughout. Three deliberate small mistakes fail
it: the relief's last octave dropped a step early (fails 14 views), a
layer skipped at a weight of 0.006 instead of 0.004 (all 19), a regrown
field's grass cut a hair shorter (6 views, those with a regrown field's grass in them). 1/255 of a pixel's
own light is less than the least step an 8 bit display shows at any
exposure, and the photographic pass adds grain of 0.006 to every pixel
every frame, ten times the largest move.

**Measured.** Parked views, the two interleaved (ground check, GPU 0 at
4 to 58 %): the scene pass 1.0 to 1.9 ms faster, the ground alone 0.5 to
1.3, the grass alone 0.2 to 0.4. perf-play, three runs of each
alternating, median of the runs:

| Scenario | main: GPU avg / p10, scene, sensor | this: GPU avg / p10, scene, sensor | frame avg |
| --- | --- | --- | --- |
| swiss-low, quiet card (GPU 0 5 to 60 %, gnome-shell) | 11.12 / 9.62, 5.78, 2.42 | 9.46 / 8.12, 4.71, 1.95 | 13.69 to 11.68 |
| wing-cruise, same runs | 7.80 / 6.81, 5.40 | 6.62 / 5.89, 4.26 | 8.94 to 7.66 |
| swiss-low, busy card (another agent's page at 42 to 72 %) | 12.18 / 10.11, 6.02, 2.68 | 10.02 / 8.12, 4.70, 2.05 | 15.77 to 13.06 |

The first pair of rows is ground.js alone; the last has the grass change
too. The sensor view's thermal draw runs the same programs, so it gained
0.5 ms without a line of its own changed.

### What was tried and not kept

- **A walk that stops at the first cut in s2Cuts** (the parcels): the
  same answer on paper, but the hash it reads rounded differently once
  the loop was not unrolled, and a field boundary moved in three views
  (996 pixels over 1/255 in lake-high). Dropped; perf-ground-check's
  `--edits` and `--variant=all-edits` found it hunk by hunk.

### The sensor view's thermal draw: the lake bed is not invisible to it

P3 proposed leaving the lake's bed out of the thermal draw as a surface
the water covers. `scripts/perf-thermal-check.js
--skip=swiss2-lake-bed,swiss2-lake-near-bed` says otherwise: the water's
sheet is translucent in the thermal draw too (it writes its temperature
at its own alpha), and the bed's pass multiplies what lies under it, so
leaving the bed out moved the whole lake's temperature by up to 0.5 (50
degrees) in every lake view, for 0.03 to 0.15 ms. Not built. Whether the
lake should read as its bed at all in long wave infrared, where water is
opaque within a fraction of a millimetre, is a thermal look question for
the sensor's owner, not a performance one. The grass and meadow stay in
the thermal draw (the owner's eye, as P3 said); they got cheaper with the
grass change above instead.

Decided 2026-10-05 (thermal-true): water is opaque in the thermal picture
and the bed pass is left out of the thermal draw (`thermalHide`,
docs/AVIONICS-SENSORS.md section 3). perf-thermal-check with the same skip
now passes in every view, 0 temperatures moved, since the bed is never in
the thermal draw. perf-play, the sensor view's draw, avg / p10 ms: swiss-low
2.19 / 1.56 before, 1.78 / 1.41 after; itaipu-war 0.59 / 0.27 before, 0.53 /
0.27 after (GPU 0 at 71 % and 59 % in the two swiss-low runs, other agents'
pages).

### Wing-cruise's long and short frames: not ours

Of 3495 frames in a 30 s run, 1019 were over 11.1 ms, and 960 of those
were followed by a frame under 5 ms. The long frames are all GPU wait
(13.5 ms median of waiting for the frame two back; the shell's own frame
callback is 2.3 ms in long and short frames alike), and each frame's own
GPU time stays at 7 to 9 ms (p95 8.6). The long frames come on a beat:
70 % of the gaps between them are within 2 ms of a multiple of 16.7 ms
(17 to 18, 33 to 35, 43 to 45 ms), against 24 % by chance, and the
first GPU segment of a long frame (the cloud shadow bake) reads 0.33 ms
against 0.11. That is another client of the shared card on a 60 Hz beat
(the desktop's compositor, with a remote desktop session capturing it,
at 25 to 87 % in pmon) taking its time slice, and the two deep fence
then waiting through it. It moves the uncapped p95 only: with the cap
at 90 the same flight's p95 is 10.3 ms (P3's table).

### Where the frame stands against 11.1 ms

Swiss-low's GPU frame is now 9.5 ms on a quiet card (floor 8.1), under
11.1 with room, where it was 11.1. The frame interval is 11.7 ms there
because the card is shared; on a card of its own the GPU is the limit.
What is left, by size: the scene pass 4.7 (the ground about 2.5 of it at
these views, the grass 1.0), the sensor view 1.95 (its thermal draw is
vertex bound by the grass, plus its full screen passes), clouds 0.9,
the mirror 0.5, the cascades 0.45. Wing-cruise: GPU 6.6. Itaipu-war is
unchanged (no file it draws with moved).

### What is next

- The sheer faces' block costs registers on every pixel of the valley
  (0.3 to 0.7 ms with no face in view): splitting the walls' faces into
  a program of their own would buy that, but needs the wall geometry
  told apart from the floor's.
- The grass's vertex cost is the field model run per vertex for every
  drawn clump; computing it per clump on the CPU when the tile is built
  (as zones.js already mirrors it) would cut it to a texture read, at
  the price of the field's pixel fade (it reads the distance).
- The lake bed in thermal: decided, opaque water, bed left out (above).

- The lake bed in thermal: the sensor owner's call (above).

## P7, feel: the frame readout

2026-10-05. Settings, Screen, Frame readout (off by default), or F3
anywhere: four lines low on the left (src/ui/perfoverlay.js), over the
OSD's pack readout and under the freestyle combo, clear of the course
chip, the flight buttons, the speed and the throttle.

    60 fps   1% low 59
    frame 16.7 ms   CPU 2.4   GPU 2.3
    391 draw calls   1.64 M triangles
    render scale 1.00   cap off

fps and frame ms are over the last second of drawn frames (a frame the
cap skips is not counted), the 1% low is this document's definition over
the last 1024 drawn frames, CPU is the frame callback's own time
(main.js blockMs) over the same second, GPU is dynamic resolution's timer
query round the world's draw. In Quality, where dynres.js never acts, the
readout asks for the timer itself (setWatch) and lets it go when hidden;
`n/a` where the browser has no timer. Nothing per frame allocates; the
text is rebuilt four times a second.

`npm run perf:overlay` (scripts/perf-overlay-check.js) holds it to:
off by default; F3 and the setting both show and hide it and the choice
is stored; its fps within 10 % of fps worked out from the shell's own
animation frame timestamps; its draw calls the renderer's; its scale and
cap dynres's and the setting's; a GPU time in Quality on a GPU; no
pointer events. Run with SIM_GPU=1 and with the software rasteriser,
2026-10-05: all passed on both.

The cap and the display: the cap draws a frame only once 1000 / cap less
1 ms has passed since the last drawn one, so the drawn rate is the
largest whole fraction of the display's rate at or under the cap. A 90
cap on a 60 Hz display draws 60, on a 120 Hz display 60, on a 144 Hz
display 72; a 120 cap on 144 Hz draws 72. That is on purpose ("a steady
60 reads better than a heaving 90", the setting's own note), and the
readout shows the cap beside the fps it gives, so a pilot can see it.

## P7, feel: from the stick to the picture

2026-10-05. `SIM_GPU=1 npm run perf:latency -- OUT_DIR [--hz=90] [--late=1]`
(scripts/perf-latency.js) hovers a seven inch at 5 m on the Swiss valley
in angle mode and steps the yaw stick between two values from a timer at
random moments, about every 300 ms, as a thumb would, never on a frame.
For each step it finds, from outside the shell, the frame that handed the
new value to sim_input, its RC slot, and the first frame whose plant state
is a step past the slot (the first frame drawn with it), and times each
against the step. It ends at the frame's submit: the GPU and the
compositor come after, the same whichever way the plant is fed.
Headless Chrome's beat is 60 Hz; `--hz=90` replaces it with a 90 Hz beat
kept by timers (frames handed the beat's time, started when the page is
free), a model of the main thread's side only.

### Where the time went, on main

60 Hz, the browser's beat, GPU 0 at 69 to 81 % (another agent's page):

| step to (ms) | mean | p50 | p95 |
| --- | --- | --- | --- |
| the next frame's timestamp | 15.6 | 13.3 | 23.7 |
| sim_input | 15.9 | 13.7 | 24.1 |
| render start | 17.2 | 16.5 | 25.7 |
| frame submitted | 20.0 | 18.5 | 28.2 |

The frame that took the input always drew it (0 frames between), and
render interpolation is 1 ms behind the newest state by construction,
which is not worth a guess to take back. The cost was the frame that
takes it. Waiting for the next frame should average half a frame,
8.4 ms at 60 fps. It averaged 15.6, because a reading had to reach the
shell some 7 ms before the frame started to get in: the frame maps its
own start to the end of the block it steps, the RC slots (250 Hz) all
fall before that end, and the 2 ms timer's readings are stamped when they
are taken. So the newest reading, the frame's own poll, always waited for
the next frame's block, and one taken in the last RC frame or so before
the frame started did too. That was about two moves in five.

### Low latency input (Settings, Stick latency: Low, under Radio link)

main.js lines the frame's newest reading up with the last RC slot of the
block it steps, instead of the block's end: every reading the frame holds
is in the block it is drawn from. sim_input still gets slot timestamps on
the same grid, and never a wall time; a reading moves by about one RC
frame. A recording holds what reached sim_input, so replays, ghosts and
the room's poses are what they were. Off by default.

| | step to sim_input, mean / p95 | step to frame submitted, mean / p95 |
| --- | --- | --- |
| 60 Hz beat, Standard (main) | 15.9 / 24.1 | 20.0 / 28.2 |
| 60 Hz beat, Low | 8.4 / 12.7 | 13.4 / 17.6 |
| 90 Hz beat, Standard, run 1 / 2 | 9.4 / 18.1, 8.4 / 17.7 | 13.4 / 22.1, 12.6 / 22.2 |
| 90 Hz beat, Low, run 1 / 2 | 3.7 / 8.4, 4.0 / 8.6 | 8.0 / 12.5, 7.8 / 11.6 |

The 90 Hz rows were run A, B, A, B on one tree, with GPU 0 at 87 to 98 %
(another agent's page): frames missed beats (mean interval 15 to 17 ms
against 11.1), so read them as the difference, not the level. About
5 ms sooner on average at 90 and 6.6 at 60, and the tail (p95) roughly
halved at both.

Also fixed in src/input/input.js: poll() is called by the 2 ms timer
with performance.now() and by the frame with its timestamp, which is the
frame's start and can be earlier. dtMs went negative for that poll (the
keyboard's spring and the mouse's ran backwards for it) and the frame's
reading was stamped older than the reading queued before it. Stamps are
now never earlier than the last one.

## P7, feel: the other pilots in a room

2026-10-05. `SIM_GPU=1 npm run perf:peers -- OUT_DIR` (scripts/perf-peers.js)
puts one headless page in a room on a rooms server it starts, sitting on
its pad on the Swiss valley, and flies a second pilot from Node over the
real wire (hello, clock pings, a POSE every 33 ms), each pose held 50 ms
give or take 10 before it is sent, round a level circle of 15 m at
20 m/s (a 2.7 g turn): 25 m in front (near, drawn in the present by
src/game/peer.js) and 160 m away (far, drawn 150 ms in the past). Every
drawn frame's peer position against the circle says what moment it
shows and how far off the path it is. Browser beat 60 Hz, 15 s each,
GPU 0 at 56 to 81 % (another agent's page on it).

| | near: clock jitter | near: kick mean / p95 / max | near: off path mean / p95 | far: clock jitter | far: kick mean / p95 / max | far: off path |
| --- | --- | --- | --- | --- | --- | --- |
| main | 0.59 ms | 27.4 / 59.8 / 111.1 mm | 10.6 / 16.8 cm | 0.13 ms | 1.3 / 2.4 / 6.0 mm | 0.3 cm |
| this | 0.20 ms | 1.4 / 5.7 / 23.5 mm | 0.1 / 0.5 cm | 0.01 ms | 2.3 / 2.5 / 2.7 mm | 0.2 cm |

(Clock jitter: the frame to frame change in the moment drawn less the
frame's own, standard deviation. Kick: the drawn path's second
difference less the circle's, scaled to a 90 Hz frame.)

Two changes:

- **The present is carried on the acceleration too** (peer.js ACCEL).
  On its velocity alone a turning near peer was drawn on the tangent and
  pulled back by every sample, 30 times a second: 10 cm off its path and
  jolted 2.7 cm a frame on average, up to 11. The velocities the poses carry are the
  plant's own, so the newest two give the acceleration; it is bounded at
  80 m/s^2, taken only from samples at most 100 ms apart and neither
  crashed, and run for the first 100 ms of the extrapolation, so a bounce
  or a stalled stream is carried much as before. The referee harness
  (`npm run midair:harness -- --seeds=4`), what each pilot drew of the
  other at the contact, 50 ms links: straight passes 0.00 m before and
  after; the 6 g turn median 0.38 m to 0.04 m, worst 1.46 m to 0.50 m.
  Every row of the harness still passes. Nothing here reaches the
  referee, which places aircraft by their stamps (src/game/midair.js).
- **Peers are drawn at the frame's moment** (main.js roomFrame): the
  room clock at the frame's timestamp, as this pilot's own craft is drawn
  and as its own poses are stamped, instead of the room clock read part
  way through the frame. Far clock jitter 0.13 to 0.01 ms. Small on this
  light frame; the part of the frame before that line is what varies, so
  it grows with a heavy frame.

The far peer's mean kick rose from 1.3 to 2.3 mm while its maximum fell
from 6.0 to 2.7: that is the straight line drawn between two samples
turning a corner at each sample, now met on a steady beat instead of
smeared by the clock's jitter. 2.5 mm a frame at 160 m is under a pixel.
A curve through the samples' velocities (Hermite) would take it out;
not built, for that reason.

New checks in `npm run rooms:selftest`: a turning near peer is drawn
within 1 cm of its path (8.5 cm on the tangent before, which fails it),
a velocity reversal is carried at no more than 80 m/s^2, a crashed peer
on its velocity alone, a stalled stream accelerated for 100 ms only.
Three of the four fail on main's peer.js.

## P6, hitches while the world streams

2026-10-05, on main at 0bba764a. High, 1600 by 900, `--mode=quality`, GPU 0
shared with the desktop and, during the A/B runs below, with another
agent's headless page (nvidia-smi pmon: 37 to 46 % of GPU 0's SM; the
utilisation column per run is in the tables).

### The brief, checked

- **Yellowstone is gone.** It was retired on 2026-10-01
  (src/maps/retired.js, "kill yellowstone, its useless"): no loader, no
  menu entry, no checks. Its "region builds hitch 90 to 440 ms" note
  has nothing left to measure.
- **Itaipu's streaming is already budgeted, and measures clean.** Its
  terrain builds chunk meshes within `buildMs` a frame, sliced by rows
  (src/maps/terrain/engine.js), its colliders refill a slice a frame
  (src/maps/itaipu.js makeStreamer), and its elevation is 86 tiles (the
  whole data folder is 22 MB). The new `itaipu-stream` scenario throws the 7 inch at 30 m/s over
  the river below the dam and flies it 50 m up, flat out (27 m/s), north
  east across Hernandarias. 120 s free running (3.2 km): 42 frames over
  16.7 ms (0.25 %), 2 over 33.3, max 43 ms. Of those, the ones over 20 ms
  were the GPU (a wait on the frame two back of 13 to 31 ms with the
  frame's own GPU time 6 to 8 ms: the shared card) and the rest an
  interval of about 16.7 ms with 3 ms of frame callback, the headless
  page's beat. 120 s at raf, the main thread's runs over 16.7 ms: 8, none
  of them streaming: a program linked in flight (below), two garbage
  collections (24 and 18 ms) and four frames together at 55 s where
  everything on the main thread ran slow at once (render, the water
  test, sorting), which is the host, not a subsystem. The terrain and
  colliders (`updateShadowFocus`) were 12 ms of the 420 ms in those runs.
- **KTX2 does not pay here.** 60 s of the Itaipu flight uploaded 2.0 MB
  of texture in all (3606 calls, 14 ms); the only upload over 1 ms was
  two 512 by 512 surfaces from swiss2/assets.js loadSurface decoded and
  uploaded in the frame they first showed (7.5 and 3.7 ms). That is a
  first use cost, for the prewarm, not a format one. Compressed textures
  would save GPU memory, which nothing measured here is short of.

### What did hitch: the swiss2 meadow

`--pace=raf`, the busy runs over 16.7 ms, swiss-low and wing-cruise on
main: 14 to 20 and 4 to 7 per 30 s, two thirds of them in
`updateWind` (src/maps/alps.js) under the meadow's tile builds
(src/maps/swiss2/vegetation/grass.js buildTile, coverOff and the field
model under it), 16 to 82 ms each. The near layer (16 m tiles out to
40 m, 1444 samples a tile, 2.3 ms a tile measured) worked out every new
tile in the frame it came into range, five or so at each tile crossing;
the wing dipping under the layer's 40 m ceiling found every tile in
reach missing at once (65 to 82 ms). The middle layer (32 m tiles,
0.9 ms each) worked out four a frame.

**Built: tiles are worked out ahead, in the background, and only a tile
that can show is worked out in the frame that needs it.** A clump is
folded to its root in the shader past its edge, which is never past the
layer's radius, so a tile whose nearest point (padded by a spacing for
the flat plants) is further than the radius cannot put a pixel on the
screen. Every draw of the mesh is from the shell's camera (the sensor
view draws it; the lake's mirror reflects it in a level plane, and skips
the grass anyway). Such a tile is left out of the draw until it is
there; one that can show is worked out at once, as before, so the
picture never waits on the background. The background works out every
tile to two tiles past the drawn ring (32 m for the near layer, 64 m for
the middle one), nearest first, a row at a time within 1 ms a frame per
layer, and keeps going up to that far over the layer's ceiling (72 m
over the ground for the near layer, 79 m for the middle). A tile is one
generator over its rows with one rng, so its clumps are the same however
many frames it took. At 90 fps 1 ms buys about 40 near tiles a second;
30 m/s needs about 20.

That is work main never did where nothing is drawn: wing-cruise at 40 m
is over the middle layer's 15 m ceiling, and the background still built
504 of its tiles in 30 s (414 ms, under 1 ms in any frame; the near
layer 470 tiles, 1021 ms, which is the point: its ceiling is 40 m and
the wing dips under it). On this card it hid in the GPU wait (the mean
frame did not move); on a CPU bound machine it is up to 1 ms a frame per
layer.

Interleaved A (main), B (this), `--mode=quality`:

| raf, 30 s | runs > 16.7 ms | of them > 33.3 | ms in them | tiles worked out in the frame that needed them |
| --- | --- | --- | --- | --- |
| swiss-low A | 20, 14, 16 | 3, 3, 3 | 607, 423, 461 | all |
| swiss-low B | 1, 2 | 1, 2 | 38, 73 | 0 of 420, 0 of 426 |
| wing-cruise A | 6, 7, 4 | 1, 1, 1 | 181, 225, 145 | all |
| wing-cruise B | 1, 1 | 1, 1 | 70, 59 | 0 of 974, 0 of 974 |

What is left in B is a program linked in flight (swiss-low, 18 and 22
ms, below) and a garbage collection (wing-cruise, 34 ms).

| free running, 30 s | avg ms | p99 | max | > 16.7 ms | > 33.3 ms |
| --- | --- | --- | --- | --- | --- |
| swiss-low A | 12.43, 11.12 | 18.1, 17.8 | 42.4, 29.5 | 46, 39 | 2, 0 |
| swiss-low B | 11.26, 11.09 | 16.7, 15.0 | 63.1, 31.3 | 27, 16 | 1, 0 |
| wing-cruise A | 7.59, 7.50 | 16.4, 15.3 | 61.8, 66.0 | 36, 21 | 2, 1 |
| wing-cruise B | 7.56, 7.54 | 15.0, 14.9 | 22.7, 24.7 | 12, 13 | 0, 0 |

The mean is unchanged (the same work, spread); the tail is what moved.
B's 63 ms swiss-low frame is 0.7 s into its window, 45 ms of it outside
the frame callback, with no tile built in it.

**Identity: `scripts/perf-grass-check.js`.** Two page loads fly one
replayed path stepped inside the page (low at 30 then 60 m/s, a turn on
the spot, a climb over the ceiling and a dive back, a 400 m jump, a
hold), the first with main's grass.js served in place of this tree's.
Per step it hashes, by 32 m square, every instance record nearer the
camera than the layer's radius. Pictures cannot be compared across two
loads (the light, clouds and wind follow the session clock); the buffers
are what the unchanged shader draws. Result over 1020 steps: the near
layer equal in every step (19 809 838 clump-steps both), the middle
layer equal at the end and a superset on the way (16 steps drew squares
main had not reached yet: less pop in, not more); no buffer ever full.
The check fails on a mutation that halves the radius (1199
differences).

The lead's run of the check on main with #468 and #472 merged failed
(54 differences, near layer, steps 774 to 780, after the jump): a
refill for a tile the background had just finished drew the ring
round where the camera had got to, not the ring chosen when it crossed
into its tile, so tiles at the leading edge showed a crossing early, at
a moment set by how fast the background ran. Fixed: a refill draws the
ring the crossing chose, as main does. The check now flies this tree a
second time with the background slowed to 0.3 ms a frame, where that
refill happens every run (the old refill fails it with the same 54
differences; the fix passes); three runs on main with #466, #468 and
#472 merged: ok, ok, ok. `perf-ground-check.js --base=main` refuses until this
merges, by its own design: grass.js's hunks here are not shader text.

### What is next

- **Programs linked in flight**: 18 to 62 ms, swiss-low at 8.5 s every
  run (the lake's bed, the reeds), itaipu-war and itaipu-stream 6 to
  31 ms (Itaipu's canopy bark, a town ring). The maps' own
  `renderer.compile(scene, camera)` runs with no target bound, so it
  builds each material's screen variant, which nothing draws, and the
  waves handed over when a run starts change the water's programs
  again; each composer variant was linked the first time its mesh was
  seen. Compiling the scene for the composer at each hand over (#468)
  takes them to none in the window. Uploading every scene texture at
  load was tried and not kept: 605 ms on the title for textures the
  title never drew.
- **Textures first drawn in flight**: on swiss2 none are left once the
  title has drawn (a probe of every scene texture's upload state). On
  Itaipu the hidden trees' bark photographs were decoded in flight,
  10.6 to 11.6 ms in one frame; #472 decodes them at load (12 ms). The
  trees' foliage atlas, a 2048 by 2048 canvas, costs 170 to 248 ms to
  upload at load and 18 ms at its first draw in flight, so it is left
  there.
- The middle layer's background margin over its ceiling is its
  `ahead` (64 m), which keeps it building tiles up to 79 m over the
  ground for a layer drawn only under 15 m. A margin of its own, a few
  metres, would take that away; not changed after the A/B was run.
- Garbage: 24 to 34 ms collections remain, 35 MB a second (P2's).
- wing-cruise uploads 1.4 GB of buffer data in 30 s (bufferSubData,
  35 ms in all): throughput, not a hitch; whose it is was not traced.

## P8, garbage, collection pauses, the atlas and the buffer uploads

2026-10-06, on main at 27610fa2. High, 1600 by 900, `--mode=quality`, GPU 0
shared with the desktop and another agent's headless page (nvidia-smi pmon:
37 to 78 % of GPU 0's SM during the runs, per run in the PRs), host load
average 4 to 10 (other agents' builds and a Python job at 300 % CPU). Every
before and after below was run interleaved, A (main with this profiler),
B (#477, #478 and #479 together), A, B.

### The brief, checked

- **"wing-cruise uploads 1.4 GB of buffer data in 30 s" was perf-play
  counting offsets.** It summed `bufferSubData`'s second argument, the
  destination offset, as the bytes. Counted from the data handed over,
  wing-cruise uploads 84 to 250 MB in 30 s, itaipu-war 59 to 102, swiss-low
  508 to 587. Most of swiss-low's is the meadow's instance buffer
  (vegetation/grass.js:788, about 320 MB in 20 s under `--buffers`),
  uploaded whole each time its drawn ring changes, which it does as the
  camera turns: data that changed, 75 ms of CPU in 30 s. Left as it is.
- **The pauses over 16.7 ms are full mark-compacts, not the garbage
  rate's scavenges.** `--gctrace` names them: one `V8.GCHandleGCRequest`
  (the mark-compact's finishing pause) per 30 s on Itaipu, 17.6 to 23.8 ms
  on main free running and 9.6 to 33.2 with the cap at 90, and about one
  per 6 s on the Swiss valley, 10 to 16 ms. Scavenges stay at 1 to 11 ms
  free running, up to 17 with the cap at 90. A mark-compact's pause is set by the
  live heap, about 660 MB on Itaipu after a forced collection, not by how
  much garbage was made: less garbage makes it rarer, not shorter. The one
  pause per run is also the noisiest number here: on main, 17.6 and 23.8
  ms in two free runs, 9.6 and 16.7 in two capped ones.
- **P2's "GC is 0.7 % of the main thread"** is right as an average: 5 to
  18 ms of pauses per second, 1 to 2 %. The pauses are what count, and a
  frame that meets one is late.
- **The thermal draw's fog.** renderThermal takes the scene's fog away for
  its call, which sends every fogged material back through three's
  getProgram twice a frame. swiss2 and Itaipu draw with no fog (`fog:
  false`), so there is nothing to gain on the maps measured; not changed.
- **The atlas's 170 to 248 ms at load was a wait.** See below.

### How it was measured

perf-play gained (scripts/perf-play.js): every collection's pause, from
the sampled profile's "(garbage collector)" runs, and the garbage per frame
beside the rate; `--alloc`, the sampling heap profiler with the collected
objects kept, by function and by the src/ caller under it; `--gctrace`,
V8's GC events on the main thread by collector; `--buffers`, each buffer
upload's bytes charged to the src/ line that set needsUpdate.

The trace undercounts the young generation's collections (12 to 19
MinorGC events in Swiss runs whose heap fell 55 to 85 times), so it names a
long pause; the profile counts them.

Program switches were counted with a copy of three whose setProgram says
why it went back to getProgram, served in place of the CDN's through
tests/lib/page.js's override (a scratch tool, not committed).

### Where the garbage came from

Main, `--alloc`, 20 s, sampled allocation in KB a frame (a frame is the
fair unit: the rate in MB/s rises with the frame rate):

| | itaipu-war | swiss-low | wing-cruise |
| --- | --- | --- | --- |
| all | 279 | 979 | 692 |
| three, drawing the scene, the sensor view and the mirror | 199 | 286 | 101 |
| the meadow's tile builds (coverAt, meadowField, s2Cuts, buildTile) | | 219 | 328 |
| the meadow's drawn ring (tileBox, update) | | 140 | |
| world-audio nearestOn | | 44 | 38 |
| swiss2 terrain height (a double returned per call) | | 36 | 30 |
| no src/ caller (the browser, perf-play's own timer queries and fences) | 12 | 37 | 29 |

What three makes per draw (its uniform setters, its render list's sort,
getProgram's parameters for a material that changes program) is out of
reach without patching three; what is left of the shell's is spread over
dozens of helpers returning or storing doubles.

### What was built

**The meadow without garbage per clump or per frame** (#478). The
drawn ring is chosen in two typed arrays instead of a key string and new
arrays every frame, and a tile's box filled from one constant list (tileBox
built five arrays and a Vector3 per tile per frame). coverAt fills one
object and meadowFieldInto a field the caller keeps, instead of an object
per clump with arrays in it. Every number is worked out as before: a node
comparison of main's meadowField with both new forms at 400 000 points
found no difference, and perf-grass-check flies the base's zones.js
beside its grass.js.

**One program per material** (#477). three keeps one current
program per material, and a material drawn on an instanced and a plain
mesh went back through getProgram at every switch: about 940 a second on
swiss-low (the vehicles' body on their wheels), 90 on wing-cruise (the
lift's on its cabins), 820 in the shadow pass on itaipu-war (three's
shared depth material between the breakage's pieces and the dam). Each
instanced user has a material of its own made the same way; none of those
switches is left, and getProgram's parameters (9.2 ms a second of
swiss-low's main thread) drop out of the profile's top functions.

| `--alloc`, KB a frame, A against B | itaipu-war | swiss-low | wing-cruise |
| --- | --- | --- | --- |
| all | 279, 260 | 979, 725 | 692, 576 |

Free running, 30 s, two runs each:

| | garbage KB a frame | GC pauses | over 5 ms | over 16.7 ms | longest | frames over 16.7 ms |
| --- | --- | --- | --- | --- | --- | --- |
| itaipu-war A | 342, 313 | 66, 83 | 12, 3 | 1, 1 | 17.8, 20.0 | 5, 3 |
| itaipu-war B | 324, 297 | 70, 78 | 11, 11 | 1, 1 | 18.7, 33.7 | 11, 2 |
| swiss-low A | 855, 736 | 95, 106 | 46, 37 | 1, 0 | 16.9, 15.0 | 127, 11 |
| swiss-low B | 650, 664 | 74, 78 | 47, 45 | 1, 0 | 16.8, 16.6 | 42, 7 |
| wing-cruise A | 569, 637 | 89, 114 | 32, 23 | 2, 0 | 38.7, 15.6 | 193, 32 |
| wing-cruise B | 506, 499 | 98, 102 | 34, 46 | 0, 1 | 15.7, 17.0 | 20, 24 |

Capped at 90 (the owner's target), 30 s, `--gctrace`, two runs each:

| | garbage KB a frame | GC pauses | over 5 ms | over 16.7 ms | mark-compact pause (trace) | frames over 16.7 ms |
| --- | --- | --- | --- | --- | --- | --- |
| itaipu-war A | 464, 410 | 51, 55 | 31, 33 | 3, 2 | 9.6, 16.7 | 12, 6 |
| itaipu-war B | 419, 402 | 49, 53 | 33, 31 | 2, 2 | 14.7, 33.2 | 16, 9 |
| swiss-low A | 762, 834 | 102, 98 | 10, 9 | 0, 0 | none in the window, none | 8, 74 |
| swiss-low B | 685, 644 | 75, 71 | 33, 30 | 0, 0 | 10.1, 11.9 | 12, 90 |
| wing-cruise A | 580, 596 | 86, 86 | 36, 32 | 0, 0 | 10.3, none | 10, 1 |
| wing-cruise B | 591, 620 | 88, 92 | 29, 23 | 0, 1 | 11.0, 11.1 | 6, 40 |

With the cap there is slack between frames, and V8 collects in it: the
profile counts a collection run in that slack as a pause, but it holds no
frame. Itaipu's pauses over 5 ms went from 3 to 12 free running to 31 to
33 capped while its late frames stayed at 6 to 16; read the pause columns
here as collections, the last column as what the pilot sees. The second
swiss-low pair and the second wing-cruise B ran with GPU 0 at 57 to 75 %
(another agent's page), which is most of their late frames.

The garbage per frame fell by a fifth to a quarter on the Swiss valley
(sampled 979 to 725 KB on swiss-low, 692 to 576 on wing-cruise) and by a
few per cent on Itaipu, whose own garbage moves with the war (201 to 356
KB a frame across runs of one tree). The collections are fewer on
swiss-low (95 to 106 against 74 to 78 in 30 s). The brief's targets, a
large factor off the garbage and no pause over 16.7 ms, are not met: what
is left of the garbage is mostly three's own, and the pauses over 16.7 ms
are the mark-compacts, set by the live heap.

**Itaipu's foliage atlas under the loading screen** (#479). The trees'
2048 by 2048 canvas and its mip levels were uploaded in the frame the near
trees first came into view: 18.4 ms for the top level and 4.1 for the
next, about 25 in one frame, parked by itaipu-views.js's ground-forest-edge
after the flight starts. P6 tried it at load and measured 170 to 248 ms;
that was the wait, not the upload: it was called just after
renderer.compile, and its 16 MB queued behind every program the compile
had handed the GPU process (251 ms, measured the same way). Called before
the compile it costs its own 22 to 26 ms. prewarm.js now uploads hidden
canvases as well as photographs (uploadHiddenTextures), and Itaipu calls
it before the compile and again after. Uploads over 2 ms, from load into
flight: in flight 30.8 ms before, none after; before the flight 92 ms
before, 139 after.

### Tried and not kept

- **BatchedMesh's sort in place.** three r160's BatchedMesh sorts its
  draw list with Array.prototype.sort on every draw of it, and V8's sort
  copies the list each call: sortOpaque was Itaipu's largest allocator,
  about 15 MB/s. A stable merge sort over a kept scratch array gave the
  same order item for item (a selftest against three's, which an unstable
  merge fails) and took that garbage away, but itaipu-war's mark-compact
  pause went from 17.6 and 23.8 ms (main) and 19.1 and 19.1 (the other
  changes alone) to 40.3 and 52.9 with it, in interleaved runs. Why is not
  known; not kept.
- **Uploading the atlas as ImageBitmaps.** The same texels (every level
  compared as floats, none differ), 10 to 13 ms to upload instead of 23 to
  27, but createImageBitmap takes 13 ms of its own; under the loading
  screen the canvas is cheap enough.

### What is left

- The mark-compact pause: 10 to 16 ms on the Swiss valley, 10 to 53 on
  Itaipu, about once per 6 s and per 30 s. It is the live heap (660 MB on
  Itaipu; of the 107 MB a sampled census could place, the town's roofs,
  the dam's triangles and the power lines lead, as JS objects) that would
  have to shrink.
- three's own garbage while drawing (about 200 to 290 KB a frame), most
  of it in the scene's three draws a frame with the inset up.
- Transparent double sided materials (the falls, the cascade, the
  glass): three draws them in two passes, changing the material's side and
  bumping its version for each, so getProgram runs twice per draw, about
  1 000 times a second on swiss-low. Making them two meshes would change
  the order other transparent things are drawn in; not touched.
- world-audio's ambience walks every lake outline every frame: 35 to 50
  ms a second of the main thread on Itaipu, and nearestOn 40 KB of garbage
  a frame on the Swiss valley.
- A 2048 by 2048 ImageBitmap uploaded at the first frame of a flight on
  Itaipu, 8 to 15 ms.
- perf-grass-check fails on main (1cd8dc2d and 27610fa2, with host load 5
  to 7): 25 differences in its slowed run (the middle layer, steps 760 to
  763, after the jump), the same 25 on every branch here, and once 66 with
  one at full speed. The lead's runs of #472 passed; it looks timing
  sensitive.
