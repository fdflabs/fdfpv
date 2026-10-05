# What a frame of play costs

The measuring stick every performance change is judged by. The owner's
target, 2026-10-05: **90 fps, an 11.1 ms frame**. `scripts/perf-play.js`
takes the numbers:

    SIM_GPU=1 npm run perf -- OUT_DIR [--scenarios=itaipu-war,swiss-low,wing-cruise]
        [--seconds=30] [--repeat=2] [--preset=high] [--pace=free|raf]

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
  per composer pass, `shadow`, and `other` for everything drawn outside
  the composer (the lake's mirror, the avionics sensor view's own scene
  draws);
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
