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

**The GPU is not this page's.** Throughout the baseline nvidia-smi showed
GPU 0 at 100 %, the owner's desktop, and GPU 1 at 3 to 18 %. Headless
Chrome draws on GPU 0. Moving it to GPU 1 was tried again, about twenty
minutes, and failed: `--use-angle=vulkan` (with and without
`__NV_PRIME_RENDER_OFFLOAD=1`, `__VK_LAYER_NV_optimus=NVIDIA_only`,
`MESA_VK_DEVICE_SELECT`) gives no WebGL2 context at all; `--use-angle=gl-egl`
and plain `gl` stay on GPU 0 (a fullscreen shader loop moved GPU 1's
utilisation by nothing). DRI_PRIME is Mesa only and does not apply to the
NVIDIA driver. Both cards report the same PCI id, so device select by id
cannot tell them apart.

So every frame time here is inflated by the desktop's share of the card,
by an amount that changes run to run, and a timer query counts the
desktop's work too. Read the numbers this way:

- **frame ms** is what this box does today, an upper bound for an idle
  card;
- **GPU floor** is each GPU segment's tenth percentile, summed: the frame's
  own GPU cost with the least of the desktop in it, a lower bound;
- **CPU ms** (physics, scene, render) are the main thread's own and are
  much less contaminated, **except** where the main thread blocks on the
  GPU (the readback below), which the shared card makes far worse;
- the run with the least mean frame time is reported (best of 2); the
  JSON keeps both runs.

The host load average was 9 to 20 during the runs (other agents' work).

## Baseline, main at 6a23782e, High, uncapped

Best of two 30 s runs per scenario.

| Scenario | Frames | Avg ms | p50 | p95 | p99 | 1% low fps | > 11.1 ms | > 16.7 ms | > 33.3 ms | Headroom vs 11.1 (avg / p95) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| itaipu-war | 628 | 47.9 | 46.9 | 74.7 | 86.7 | 10.6 | 627 | 625 | 517 | -36.8 / -63.6 |
| swiss-low | 398 | 75.7 | 75.8 | 100.7 | 130.5 | 7.3 | 397 | 397 | 396 | -64.6 / -89.6 |
| wing-cruise | 573 | 52.3 | 51.2 | 71.4 | 83.5 | 10.0 | 572 | 572 | 549 | -41.2 / -60.3 |

The other runs: itaipu-war 61.0 ms avg, swiss-low 101.5, wing-cruise 54.3.

| Scenario | Physics | Scene | Render submit | GPU wait | Other | GPU avg | GPU p95 | GPU floor | Calls avg / max | Tris avg / max (M) | Long tasks (count, ms) | GC (count, MB) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| itaipu-war | 0.25 | 43.05 | 3.53 | 0.18 | 0.88 | 19.3 | 32.4 | 5.4 | 244 / 297 | 2.33 / 3.49 | 258, 15997 | 12, 284 |
| swiss-low | 0.41 | 60.52 | 5.98 | 8.33 | 0.47 | 44.0 | 60.1 | 21.2 | 320 / 389 | 3.53 / 3.83 | 321, 25467 | 37, 951 |
| wing-cruise | 0.21 | 4.09 | 3.67 | 43.91 | 0.43 | 21.2 | 30.4 | 10.8 | 183 / 218 | 1.85 / 2.59 | 3, 318 | 26, 654 |

GPU by segment, mean / tenth percentile, ms:

| Scenario | scene | other (outside composer) | meter | bloom | shadow | clouds | ao | photo | fxaa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| itaipu-war | 4.82 / 0.75 | 11.53 / 4.14 | 0.10 / 0.01 | 0.64 / 0.11 | 0.38 / 0.11 | 0.13 / 0.01 | 0.72 / 0.03 | 0.55 / 0.16 | 0.39 / 0.04 |
| swiss-low | 16.54 / 10.82 | 19.85 / 8.84 | 2.25 / 0.02 | 1.44 / 0.12 | 1.80 / 0.36 | 0.87 / 0.71 | 0.10 / 0.08 | 0.67 / 0.17 | 0.49 / 0.05 |
| wing-cruise | 14.17 / 8.95 | 0.12 / 0.11 | 3.43 / 0.02 | 1.30 / 0.12 | 0.67 / 0.44 | 1.16 / 0.89 | 0.11 / 0.05 | 0.17 / 0.17 | 0.05 / 0.05 |

(`fxaa` is the table's name for three's `ShaderPass`.)

## Top 5 hotspots per scenario, by measured ms per frame

Where a hotspot is main thread time, the profile names the code; ms per
second of play is converted to ms per frame at the run's frame rate.

### itaipu-war (47.9 ms frame)

1. **The avionics sensor view's synchronous readback, 41 ms a frame.**
   `getBufferSubData` called from `poll` (src/render/sensorview.js:395)
   held the main thread 854 ms of every second. The readback is double
   buffered behind a fence, but in Chrome `getBufferSubData` is a round
   trip to the GPU process that waits behind everything queued there, so
   on a busy card it blocks for most of a frame and on any card it
   serialises the CPU and the GPU every frame. It is nearly all of the
   43 ms "scene" bucket.
2. **GPU outside the composer, 11.5 ms** (floor 4.1): the sensor view's own
   scene draws (`drawScene`, src/render/sensorview.js:519) and the lake's
   mirror. A drone with the avionics HUD draws the world more than once a
   frame.
3. **GPU scene pass, 4.8 ms** (floor 0.75).
4. **Render submit, 3.5 ms** of three.js on the main thread
   (`onBeforeRender`, `getBoundingSphereAt`, swiss2/post.js `render`).
5. **Long tasks: 258 in 30 s**, nearly every frame over 50 ms, which is
   item 1 seen from the event loop. Behind it: world-audio `ambience` at
   0.4 ms a frame.

### swiss-low (75.7 ms frame)

1. **The same sensor view readback, 57 ms a frame** (749 ms per second from
   sensorview.js:395).
2. **GPU outside the composer, 19.9 ms** (floor 8.8): the sensor view's scene
   draws and the lake's mirror.
3. **GPU scene pass, 16.5 ms** (floor 10.8): the valley's ground splat,
   grass and forest at 8 m, as docs/SWISS2-PERF.md found parked.
4. **Render submit, 6.0 ms**, and shader compiles in flight:
   `getProgramInfoLog` 9.6 ms per second, programs being linked while the
   craft flies into new vegetation zones.
5. **Garbage: 951 MB collected in 30 s**, 37 collections; with GPU wait
   8.3 ms.

### wing-cruise (52.3 ms frame, no avionics HUD on this craft)

1. **GPU bound: 43.9 ms a frame waiting on the GPU.** The main thread's own
   work is under 8 ms; the frame is set by the card, which the desktop
   shares. This is the one scenario that shows the valley's GPU cost alone.
2. **GPU scene pass, 14.2 ms** (floor 9.0), at 23 m/s and 40 m.
3. **GPU meter pass, 3.4 ms mean but 0.02 floor**: a spike, not a steady
   cost. Most frames it is free and some it is not (the first read of the
   colour target lands in it, per SWISS2-PERF.md).
4. **CPU scene update, 4.1 ms**: swiss2/post.js `render`, vegetation
   `coverOff` (zones.js:363), vehicles `rolled`, terrain `height`.
5. **Render submit, 3.7 ms**, and 654 MB of garbage collected in 30 s.

### Across all three

- **Physics and Betaflight are not the problem**: 0.2 to 0.5 ms a frame.
- The first fix by a wide margin is the sensor view readback: it costs
  the two combat drone scenarios 41 to 57 ms of main thread a frame
  on this box. The second is the extra world draws the sensor view makes.
- Then the valley's GPU scene pass, already characterised per mesh in
  docs/SWISS2-PERF.md.
- Every scenario allocates 20 to 30 MB a second.

## Proposed budgets (not a CI gate yet)

For 90 fps on an RTX 3060 Ti at 1600 by 900, High, judged on a run like
this one once a card can be had to itself (the frame totals here cannot
pass any of these until the desktop is off the card):

- **frame**: p95 under 11.1 ms; at most 5 % of frames over 11.1 ms, none
  over 33.3 ms in a 30 s run; 1% low at least 60 fps;
- **main thread**: physics under 1 ms, scene update under 3 ms, render
  submit under 2.5 ms, so the CPU side fits in 6.5 ms with room for the
  compositor;
- **GPU floor**: under 9 ms for the whole frame, the composer's scene
  pass under 6 ms, everything outside the composer under 1.5 ms;
- **no synchronous GPU readback on the frame's path**: `getBufferSubData`
  and `readPixels` into client memory under 0.5 ms per frame;
- **no shader compile in flight**: `getProgramInfoLog` and program links 0
  after the first 5 s of a run;
- **long tasks**: 0 over 50 ms after the first 5 s;
- **garbage**: under 5 MB allocated per second of play.

## Not measured, and why

- **A multi pilot room.** A second pilot is a second Chrome (every
  existing two pilot check, scripts/war-twopage.js among them, opens two),
  and a run here is one browser at a time on this shared box. A peer
  driven from Node over the room socket would make it one browser; that is
  the next piece of work for this script, not done here.
- **GPU 1.** See above.
- **Replays.** The crash cam replays poses, not stick input through the
  plant, so it cannot drive physics; the scripted pilot is used instead.
