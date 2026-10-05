# What a frame of play costs

The measuring stick every performance change is judged by. The owner's
target, 2026-10-05: **90 fps, an 11.1 ms frame**. `scripts/perf-play.js`
takes the numbers:

    SIM_GPU=1 npm run perf -- OUT_DIR [--scenarios=itaipu-war,swiss-low,wing-cruise]
        [--seconds=30] [--repeat=2] [--preset=high] [--pace=free|raf] [--cap=90]
        [--mode=quality|balanced|performance] [--objects]

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
  full screen passes; Itaipu's mirror is drawn from the scene's
  onBeforeRender and shows as `draw maps/itaipu/look/sky`), and `other`
  for the rest (P3 split these; the baseline below lumped them all into
  `other`);
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
   6.4 ms, its mirror 0.68 ms a frame, and its water reads the mirror's
   alpha (SMEAR), which needs its own proof before it is opted in.
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
