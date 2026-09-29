# FDFPV movie editor: cut one replay into a movie

Written 2026-09-29. The design contract for a video editor on top of the
crash cam (src/replay/). Phase 0: this document only. Three or four agents
build from it in parallel worktrees, one package each. The owner's request,
verbatim:

> i need you to add a very intuitive video editor, so that we can change
> cameras views etc in one single replay video, and then export the movie -
> this needs to be worked on in paralell workgroup in paralell from the
> other stuff

"From the other stuff" is read as: the editor is its own line of work and
must not block, or be blocked by, the other branches in flight. Its hot
shared files (src/main.js, src/strings, package.json, index.html) are
touched in small, named places only (section 6).

## 0. The brief, checked against the code

Checked on `origin/main` at e2585aa3, 2026-09-29. No open pull request
touches src/replay/ (only #176, tunes, is open).

| Claim in the brief | Holds? |
| --- | --- |
| Replay of the last 30 s with a scrubber, speeds, play and pause | Yes. `WINDOW_S = 30`, `SPEEDS = [0.1, 0.25, 0.5, 1, 2]` in crashcam.js, Up and Down change it. |
| Cameras Chase, Orbit, Free, Tripod, Onboard, Follow part | Yes: `RIGS = ['chase', 'orbit', 'free', 'tripod', 'fpv', 'follow']` in cameras.js. Onboard is `fpv` in code. |
| "plus 1 to 6 camera slots" | **Stale.** There are no slots. The number keys 1 to 6 pick the six rigs above (`RIG_KEYS` in editor.js). What a rig is framed with lives in `S.params[rig]`, one set per rig for the session. |
| "Moments" and keys (K, Unkey Del) | Yes. Moments are the `off` and `impact` events drawn as markers, `[` `]` jump between them. K stores a camera key `{ t, rig, target, p }`; Del removes the key nearest the playhead within 0.3 s. |
| What Key does | A key is a keyframe, not a cut. `evaluateKeys` glides from each key's camera to the next one's over the whole gap between them (position lerp, attitude slerp, fov lerp, `easeInOut`). Before the first key the first key's camera holds, after the last the last one's. With keys present the camera is "directed" until the pilot touches a camera, then "manual" until play. There is no hard cut and no per key speed. Keys do not record which peer was watched (`watch`). |
| Photo / Video / Save ("My clips", M) | Nearly: Photo is P, Video is C, Save is **G**, and My clips is its own button, M. |
| How Video exports | **Real time.** `exportVideo` puts `canvas.captureStream(60)` and a tap on `audio.master` into a MediaRecorder (`video/webm;codecs=vp8` first), plays the in to out range at the current speed on the wall clock and stops at out. Resolution is whatever the canvas is. A slow machine drops frames. The sound is the live mix, so it includes the music bed when music is on. |
| How clips are stored | IndexedDB `webfpv.replays.v1`, store `clips`, at most 40 (store.js). A row holds the `.fdfreplay` bytes (file.js, versions 1 to 5, the lowest version that holds the clip is written), a 320 x 180 JPEG thumb, name, airframe, map, duration. Save trims to the in to out range (`trimClip` shifts keys and events) and always makes a new row. Keys live in the file header, at most 64. |
| "The replay renders recorded poses; physics is deterministic at 1000 Hz" | Half right, and the half that matters for export is the other one. The replay never runs the plant: it interpolates recorded rows (`sampleAt`, one row per rendered frame at up to 120 Hz, slerped), so any clip time can be drawn at any moment, which is what makes offline export possible. The 1000 Hz determinism only matters for TAKE OVER. What is **not** deterministic today is the visual state stepped by the frame's delta: debris (`debris.update(dt * speed)`, seeded bursts but a variable step), the combat paper and the smoke. A preview at 144 Hz and an export at 60 fps would differ slightly. Section 4.3 fixes that with a fixed step edit clock. |
| Peers and combat paper drawn true to the past | Yes (peerscene.js, paperscene.js, versions 4 and 5 of the file). |
| The owner's screenshots of the controls bar | Not in the repository. The style reference used here is src/replay/style.js and editor.js as built. |
| Suggested cut keys C or S | **Both taken.** C is Video, S flies the free camera back (W A S D Q E). Section 2.4 uses K, which already means "change camera here". |
| MP4 muxer | Checked below (section 5.4). |

Measured in headless Chromium on this box with a scratch page (not
committed), because the design leans on each of these:

* `new VideoFrame(canvas)` on a WebGL canvas **without**
  `preserveDrawingBuffer`, in the same task as the draw, reads the drawn
  pixels (255, 0, 0, 255 for a red clear). After one task boundary it reads
  0, 0, 0, 0. So a frame must be captured in `afterRender`, where Photo
  already reads the canvas, and nowhere later.
* `VideoEncoder.isConfigSupported`: `avc1.640028` (H.264 High 4.0) true at
  720p and 1080p; `avc1.42001f` (Baseline 3.1) false at 1080p; VP8, VP9 and
  AV1 true at both.
* `AudioEncoder`: Opus true, AAC (`mp4a.40.2`) **false** on Linux Chromium.
  An MP4 therefore carries Opus here and AAC only where the platform has it.
* `OfflineAudioContext` exists, and src/render/audio.js `MotorAudio` was
  written to run on one (`attach(ctx)`, `update(rpm, speed, atTime)`,
  `wreck(kind, level, atTime)`, `schwing(level, atTime)`; used by
  scripts/audio-probe.js). The engine, the wind, the crash cues and the
  SCHWING can be rendered offline.
* 60 VP8 frames at 720p queued with no backpressure reached
  `encodeQueueSize` 60 and took 1.6 s to flush on this loaded box. The
  export must wait on the queue, not assume the encoder keeps up.

Nothing the owner asked for is impossible in a browser. Two things are
narrower than asked, said here once:

* **Music is not in the exported movie.** The bed plays through a media
  element, which an `OfflineAudioContext` cannot host, and which track was
  playing at which second is not recorded. Engine, wind, crash cues and the
  SCHWING are in it. The real time fallback (5.3) records the live mix and
  so does carry music, as today.
* **The replay OSD is not in the movie.** It is DOM over the canvas, as it
  is in today's videos. The letterbox is drawn on the canvas and is in it.

## 1. Decisions

1. **The editor is the crash cam screen, not a new mode.** Every replay
   opens with an edit: one shot, Chase, the whole clip. There is no
   directed or manual state and no separate Edit view to find. What you see
   playing is the movie.
2. **A shot is a stretch of the clip with one camera.** The camera, its
   framing, its speed and how it starts belong to the shot. The shot under
   the playhead is the selected one: every camera button, the speed buttons,
   drag to look and the wheel act on it. No separate selection.
3. **K cuts.** K and the Cut button split the shot under the playhead into
   two with the same camera; pick the new shot's camera with 1 to 6. Del
   removes the cut nearest the playhead. The old "key here with this camera"
   becomes "cut here, then pick", and the letters stay where pilots know
   them.
4. **Keys become shots, exactly.** A clip saved with keys opens as the
   equivalent edit (shots with the Glide transition), and the check proves
   the camera is the same pose at every sampled time. `clip.keys` is then
   gone from the running code; files keep being read.
5. **Three transitions:** Cut (default), Blend (a short mix, 0.25, 0.5 or
   1 s of movie time) and Glide (the previous shot moves all the way into
   this one, which is what keys did, and is how to make a camera move).
6. **Speed is per shot**, from the existing five speeds. The timeline is
   drawn in clip time, so markers and the recording stay where they are;
   the movie length is shown beside it.
7. **One clock for preview and export.** Movie time advances in whole
   frames of the chosen frame rate; debris, smoke and paper step by exactly
   one movie frame's worth of clip time. A slow preview frame skips pictures,
   never changes them.
8. **Export is offline** with WebCodecs: frame by frame at 30 or 60 fps,
   720p or 1080p, the encoder's queue is waited on, no frame is dropped.
   Without WebCodecs, the same edit is recorded in real time with
   MediaRecorder, and the dialog says it may drop frames.
9. **MP4 and WebM** through two pinned MIT muxers from jsDelivr (5.4).
   MP4 is the default where H.264 encodes, because it is what a phone and
   a chat app take.
10. **The edit is saved inside the replay file** (version 6 header field
    `edit`). A clip reopens with its shots. Save on a clip that is already
    in My clips overwrites it instead of making a copy.
11. **Undo and redo** cover every change to the edit, a drag is one step.

## 2. The user flow

### 2.1 The screen

The dock keeps today's layout. The thin track becomes a strip of shots; the
rows under it change their meaning, not their place.

```
+---------------------------------------------------------------------------+
| CRASH CAM  Skyhunter 14:02                     [My clips M] [Back  Esc]   |
| [Shot 2 of 4] [Orbit] [0.25x] [Movie 0:18.40]                             |
|                                                                           |
|                         (the replay, full screen)                         |
|                                                                           |
|  SPEED 42 km/h  HEIGHT 3 m  THR ####                                      |
|                                                                           |
| +-----------------------------------------------------------------------+ |
| |        o impact            <> wing off                                | |
| |  ::::[ CHASE    | ORBIT 0.25x   / FREE       ~ ONBOARD   ]::::::    | |
| |       ^in       ^cut   #      ^blend       ^glide       ^out          | |
| |                        # playhead (shot 2 outlined)                   | |
| +-----------------------------------------------------------------------+ |
| |<< |< [>] >| >>  0:12.40 / 0:30.00  [.1 .25 .5 1 2]x   CAMERA          | |
| |                              [Chase Orbit Free Tripod Onboard Follow] | |
| |                              [part v] [Cut K] [Uncut Del] [Undo Z]    | |
| | LOOK [OSD H] [Letterbox L]  RANGE [In I] [Out O]                      | |
| | KEEP [Photo P] [Export movie C] [Save G]            [TAKE OVER Enter] | |
| |  K cut here  1-6 camera for this shot  drag an edge to move it  Z undo| |
| +-----------------------------------------------------------------------+ |
+---------------------------------------------------------------------------+
```

* Each shot is a block in its camera's colour with its camera's name, and
  its speed when it is not 1x. Colour is never the only cue: the name is
  on the block, and a block too narrow for it shows the rig's number.
* The shot under the playhead is outlined. Outside in to out the clip is
  dimmed, hatched (`::::`).
* A cut is a grip between two blocks, drawn by its transition: a bar for
  Cut, a slash for Blend, a tilde for Glide. The outer grips are In and Out.
* The markers (moments) sit above the strip as today.

### 2.2 The five things a pilot does, and nothing to read first

1. **Watch it.** The replay opens playing, as today. Space, the scrubber,
   the arrows and `[` `]` work as they do now.
2. **Cut and pick a camera.** Stop where the camera should change, press K
   (or Cut), press 2 for Orbit. The shot from there on is an orbit. Drag on
   the picture to swing it, wheel to zoom: that framing is this shot's.
3. **Move and delete cuts.** Drag a grip along the strip; it snaps to
   moments, recorded frames and the playhead. Del removes the nearest cut,
   the toast says `Cut removed. Z to undo.`
4. **Slow a shot down.** Up and Down, or the speed buttons, set the speed
   of the shot under the playhead.
5. **Export.** C opens the export dialog (2.5). Enter starts, the bar
   fills, Esc cancels, the file downloads.

Clicking a grip opens a small popover on it: `Cut | Blend | Glide`, and for
Blend `0.25 s | 0.5 s | 1 s`. T cycles the transition of the cut that
starts the shot under the playhead.

### 2.3 Keyboard

Only keys that are free today are added. Every existing key keeps its
meaning except the three that were about keys, which keep their place.

| Key | Today | With the editor |
| --- | --- | --- |
| K | add a camera key | **cut at the playhead** |
| Delete, Backspace | remove the nearest key | **remove the nearest cut** |
| 1 to 6 | switch rig (manual) | **camera of the shot under the playhead** |
| Up, Down | playback speed | **speed of the shot under the playhead** |
| I, O | range in and out | move the movie's first and last edge (same meaning) |
| C | record a video in real time | **open the export dialog** |
| G | save a new clip | save; overwrite when the clip is already saved |
| T | (free) | cycle the transition of this shot's cut |
| Z | (free) | undo |
| Shift+Z, Ctrl+Y | (free) | redo |
| Ctrl+Z, Ctrl+Shift+Z | (free) | undo, redo (the same, for editor habits) |
| Comma, Period | (free) | playhead to the previous, next cut |

W A S D Q E, Space, arrows, Home, End, `[` `]`, J, Tab, H, L, P, M, U, V,
Esc and Enter are unchanged.

### 2.4 Pad (standard mapping)

Today: A play, B close, X next rig, Y key, LB RB and d-pad left right
step, d-pad up down speed. Added, nothing moved:

| Button | With the editor |
| --- | --- |
| Y (3) | cut (was key) |
| X (2) | next camera for this shot (was next rig) |
| LT, RT (6, 7) | playhead to previous, next cut |
| Back (8) | undo |
| Start (9) | export dialog; in the dialog, start |
| L3 (10) | remove the nearest cut |

When a pad is connected the hints line shows the pad's names instead of
the keys (the prompt already switches V for X the same way). Package C
confirms first that main.js does not also consume Back, Start, the
triggers or L3 while the mode is `replay`.

### 2.5 The export dialog

```
+------------------------------------------+
| EXPORT MOVIE                0:18.40      |
|                                          |
| Size     [ 720p ] [*1080p*]              |
| Frames   [ 30 ]   [* 60 *]               |
| File     [* MP4 *] [ WebM ]              |
| Sound    [* On *]  [ Off ]               |
|          engine, wind, crashes. No music.|
|                                          |
|          [Cancel Esc]  [Export Enter]    |
+------------------------------------------+
            then
+------------------------------------------+
| EXPORTING                                |
| [##################--------------] 58%   |
| frame 642 of 1104, about 0:09 left       |
|                            [Cancel Esc]  |
+------------------------------------------+
```

Defaults: 1080p, 60, MP4 when H.264 encodes else WebM, sound on. An option
the browser cannot do is shown disabled with the reason in one line
(`This browser records in real time: a slow computer can drop frames.`).
The last choices are remembered in localStorage. While exporting the canvas
keeps drawing the frames being encoded, so the export is its own preview.
The file name is today's `fdfpv-<map>-<stamp>.mp4`.

## 3. The data model

### 3.1 The edit decision list

One JSON object, stored in the clip. All times are clip seconds unless the
name says `movie`.

```js
edit = {
  v: 1,
  out: 21.35,                      // clip time the movie ends
  look: { letterbox: false },
  shots: [                         // at least 1, at most 64, t0 strictly rising
    {
      t0: 3.10,                    // clip time the shot starts; shots[0].t0 is In
      cam: {
        rig: 'chase',              // one of RIGS
        target: -1,                // -1 the craft, else a part index (follow, orbit, tripod)
        watch: 0,                  // 0 this pilot, else a peer id in clip.peers
        p: { dist: 2.6, height: 0.9, fov: 68 },   // the rig's numbers, as defaults(rig) shapes them
      },
      speed: 1,                    // one of SPEEDS
      enter: { type: 'cut' },      // shots[0] is always 'cut'
    },
    {
      t0: 9.42,
      cam: { rig: 'orbit', target: -1, watch: 0, p: { az: 1.9, el: 0.3, dist: 3.1, fov: 60 } },
      speed: 0.25,
      enter: { type: 'blend', d: 0.5 },   // d is MOVIE seconds: 0.25, 0.5 or 1
    },
    {
      t0: 12.0,
      cam: { rig: 'free', target: -1, watch: 0, p: { pos: [4.1, 2.0, -7.3], yaw: 0.4, pitch: -0.1, fov: 70 } },
      speed: 1,
      enter: { type: 'glide' },    // the previous shot moves into this one over its whole length
    },
  ],
}
```

Shot `i` covers `[shots[i].t0, shots[i + 1].t0)`, the last one
`[t0, out)`. The playhead exactly on a cut belongs to the shot after it.
A shot is never shorter than `MIN_SHOT_S = 0.05` of clip time.

The default edit of a clip of duration `D`, opened at playhead `t`:
`{ v: 1, out: D, look: { letterbox: false }, shots: [{ t0: 0, cam: chase defaults, speed: 1, enter: { type: 'cut' } }] }`.
An edit equal to its clip's default is not written to the file.

### 3.2 Time: clip to movie and back

The movie is the shots laid end to end, each lasting
`(t1 - t0) / speed` movie seconds. `edit.js` owns the only mapping:

* `movieDuration(edit)`: the sum.
* `movieTime(edit, t)`: clip to movie, `NaN` outside In to Out.
* `clipTime(edit, m)`: movie to clip, clamped.
* `planMovie(edit, fps)`: `n = max(1, round(movieDuration * fps))` frames;
  frame `i` is at movie time `i / fps`; returns `{ n, fps, clipT: Float64Array(n), shot: Int16Array(n), step: Float64Array(n) }`
  where `step[i]` is the clip time frame `i` advances (its shot's
  `speed / fps`, prorated across a cut). Timestamps are
  `round(i * 1e6 / fps)` microseconds and a frame's duration is the next
  timestamp minus its own, so 30 fps never drifts.

### 3.3 Transitions, as a weight

`weights(edit, t) -> { a, b, w }`: the camera at clip time `t` is shot `a`'s
camera mixed toward shot `b`'s by `w` in `[0, 1]` (`b === a`, `w === 0`
for a plain frame). Position lerps, attitude slerps, fov lerps, weight
eased with `easeInOut`, exactly as `evaluateKeys` mixes today.

* Cut: `a = b = i`.
* Blend into shot `i`: for `t` in `[t0_i, t0_i + d * speed_i)`, `a = i - 1`,
  `b = i`, `w = ease((t - t0_i) / (d * speed_i))`. The outgoing camera keeps
  running past its shot's end, so a chase blends out still chasing. The
  window is clamped to the shot's length.
* Glide into shot `i`: for `t` in shot `i - 1`, `a = i - 1`, `b = i`,
  `w = ease((t - t0_{i-1}) / (t0_i - t0_{i-1}))`.

A glide and a blend on the same shot boundary cannot both exist: `enter`
belongs to the incoming shot, so there is one per cut.

### 3.4 Keys to shots

`fromKeys(keys, duration)` gives, for keys `k0 .. kn` sorted by time: a
first shot `[0, k0.t)` with `k0`'s camera if `k0.t > MIN_SHOT_S`, then one
shot per key starting at its time with its camera, entering by `glide`
except the first. Before `k0` and after `kn` the camera holds, and between
keys it glides, which is what `evaluateKeys` does. The package B check
compares the two at 2000 times over a clip with four keys of four rigs.

### 3.5 In the file

`FILE_VERSION` becomes 6. Version 6 is written only when the clip has a
non default edit, following file.js's rule that a clip is written as the
lowest version that holds it. In version 6:

* the header gains `edit`, validated field by field like `keys` today (known
  keys only, finite numbers, rig in `RIGS`, target an integer in
  `[-1, PARTS_MAX)`, watch an integer a peer of the clip has or 0, speed in
  `SPEEDS`, transition type known, blend `d` in `{0.25, 0.5, 1}`, shots 1 to
  64, `t0` strictly rising from 0 or more, `out` after the last `t0` and not
  past the clip's end plus 1e-6);
* `keys` must be an empty list;
* `peers` and `paper` are each optional (present when the clip has them),
  unlike versions 4 and 5 which require theirs.

Versions 1 to 5 are read as today; their keys become an edit when the clip
is opened (3.4). A build before this one refuses a version 6 file with its
existing message (`version 6, this build reads 1 and 2 and 3 and 4 and 5`); a clip with no
edit is still written as version 3, 4 or 5 and opens there.

Save trims to In to Out as it does today (`trimClip`); the edit is shifted
with the same base (`trimEdit(edit, base)`), so the saved clip reopens with
its shots. A clip opened from My clips remembers its row id, and G
overwrites that row (keeping its `created`) instead of adding a new one.

### 3.6 Undo

`createHistory(edit)` keeps immutable edits, newest last, at most 200.
Every operation in `edit.js` returns a new edit and never mutates its
input, so a history entry is just a reference.

* `commit(edit)`: push, clear redo.
* `preview(edit)`: replace the current entry during a gesture, without a
  step (a drag of a grip, a drag on the picture, a free camera flight, the
  wheel).
* `begin()` / `end()`: bracket a gesture; `end` turns it into one step,
  none if nothing changed. The wheel and the free camera end their gesture
  400 ms after the last input.
* `undo()`, `redo()`, `canUndo`, `canRedo`, `current`.

Undo moves the playhead only if it would otherwise be outside In to Out.

## 4. Modules and their interfaces

```
            edit.js  (pure: model, time, weights, history, file checks)
            ^     ^      ^
            |     |      |
  editor.js |  crashcam.js + cameras.js  ---->  export.js + soundtrack.js
  (DOM)  ---+--> (api)   (playback,          (encoders, muxers, offline
                          edit clock,         audio, real time fallback)
                          export driver)            |
                                                    v
                                              main.js hooks (export surface)
```

### 4.1 `src/replay/edit.js` (new, package A)

Pure, no DOM, no Three.js, runs in Node. Exports:

```js
export const SPEEDS = [0.1, 0.25, 0.5, 1, 2];      // moved here from crashcam.js
export const BLENDS = [0.25, 0.5, 1];
export const MIN_SHOT_S = 0.05;
export const SHOTS_MAX = 64;
export function defaultEdit(duration, cam)          // cam: { rig, target, watch, p }
export function isDefault(edit, duration)
export function fromKeys(keys, duration, fallbackCam)
export function shotAt(edit, t)                     // index; t on a cut belongs to the later shot
export function cut(edit, t)                        // same camera both sides; no-op within MIN_SHOT_S of a cut
export function removeCut(edit, i)                  // i >= 1; shot i-1 absorbs shot i
export function nearestCut(edit, t)                 // index >= 1 or -1
export function moveCut(edit, i, t)                 // clamped between neighbours +- MIN_SHOT_S
export function setIn(edit, t)                      // moves shots[0].t0, clamped
export function setOut(edit, t)
export function setCam(edit, i, cam)
export function setSpeed(edit, i, speed)
export function setEnter(edit, i, enter)            // { type: 'cut' } | { type: 'blend', d } | { type: 'glide' }
export function setLook(edit, look)
export function trimEdit(edit, base, end)           // for Save's trimClip
export function movieDuration(edit)
export function movieTime(edit, t)
export function clipTime(edit, m)
export function planMovie(edit, fps)
export function weights(edit, t, out = { a: 0, b: 0, w: 0 })
export function cueTimes(edit, events)              // [{ m, t, level, ...e }] for the cues and SCHWINGs inside In to Out
export function checkEdit(edit, clipInfo)           // throws EditError with a reason; file.js calls it
export function createHistory(edit)
```

`cam.p` is copied, never shared, by every operation.

### 4.2 `cameras.js` (package B)

Adds `evaluateEdit(ctx, edit, t, out)`: `weights`, then `evaluate` for
`a` (and `b`) and the same mix `evaluateKeys` uses. `evaluateKeys` and
`addKey` are deleted once `fromKeys` is proven equal (3.4); `easeInOut`,
`slerp` and `evaluate` are unchanged. `ctx.at`, `ctx.craftQuat`, `ctx.fpv`
take a `watch` argument so a blend between two pilots' aircraft is
possible (today `watch` is session state read inside the ctx).

### 4.3 `crashcam.js`: playback and the edit clock (package B)

* `S.edit` replaces `S.clip.keys`, `S.manual`, `S.rig`, `S.target`,
  `S.watch`, `S.speed`, `S.in`, `S.out` and `directed()`. `S.history`
  holds it. `S.params[rig]` stays, as the framing a rig starts with when a
  shot is switched to it (so going back to Orbit gets the last orbit).
* **Edit clock.** While playing, `S.m` (movie time) advances by the frame's
  `dt`, and the picture is movie frame `i = floor(S.m * fps)`, where `fps`
  is the export dialog's last choice (60 by default). Every frame from the
  last drawn one to `i` is stepped: `events`, `smokeTo`, `debris.update`
  and the paper each advance by that frame's `plan.step`. More than 6
  frames behind is treated as a jump (the air is cleared and rebuilt, as a
  scrub does now). `S.t = plan.clipT[i]`. Paused, the playhead is clip time
  and a scrub sets it directly, as now.
* Play starts at In if the playhead is outside In to Out and stops at Out.
* Motor and wind sound scale by the shot's speed, as `sound()` does with
  the global speed now.
* Opening a live clip or a saved one builds the edit: `clip.edit` if the
  file had one, else `fromKeys(clip.keys)` if it had keys, else
  `defaultEdit`. The first shot is Chase framed by `defaults('chase', size)`.
* Save writes `clip.edit = S.edit` (trimmed, 3.5) and overwrites the row it
  came from when `S.savedId` is set.
* **Export driver.** `S.exporting` is a job (4.5). In `frame()`:
  `const i = job.next()`; `null` ends the export; `-1` holds (nothing is
  stepped or drawn anew, the encoder is busy); otherwise that movie frame
  is stepped to and drawn. In `afterRender()`: `job.capture(shell.canvas)`
  when a frame was drawn for it. The driver is identical for the offline
  and the real time job.

The api the screen calls (the contract with package C). Everything not
listed keeps its current name and meaning.

```js
view() -> {
  ...today's fields less: directed, keys, speed (now the shot's), in, out,
  edit,                     // the current edit (immutable)
  shot,                     // index under the playhead
  movie: { t, dur },        // movie time of the playhead (NaN outside), movie length
  canUndo, canRedo,
  exporting,                // null | { done, total, etaS, realtime }
  saved,                    // true when G would overwrite
}
cut()                       // K
removeCut(i)                // i omitted: nearestCut
moveCut(i, t)               // inside a gesture: preview; see begin/end
setIn(), setOut()           // at the playhead, as now
setEdge(which, t)           // 'in' | 'out', dragged; inside a gesture
setRig(rig)                 // this shot's camera (keeps the name)
follow(part), watch(id), nextPart(), nextWatch()   // this shot's camera
setSpeed(s | +1 | -1)       // this shot's speed (keeps the name)
setEnter(i, enter), cycleEnter()                   // T
undo(), redo()
begin(), end()              // bracket a gesture from the screen
jumpCut(dir)                // , and .
exportOptions() -> Promise<{
  webcodecs, sizes: [720, 1080], fps: [30, 60],
  formats: [{ id: 'mp4' | 'webm', ok, why }], sound: { ok, why },
}>
exportMovie({ size, fps, format, sound }) -> Promise<{ name, bytes } | null>   // null when cancelled
cancelExport()
```

`addKey`, `removeKey`, `clearKeys` and `exportVideo` are removed from the
api (the screen is the only caller; the e2e script is updated with them).

### 4.4 `editor.js`, `style.js`, strings (package C)

DOM only, as today: it holds no edit state of its own and draws from
`view()` every frame, writing only what changed (the `set()` pattern). It
builds the shot strip, grips, the transition popover, the undo and redo
buttons, the chips (`Shot 2 of 4`, the shot's camera, its speed, the movie
length), the export dialog and its progress, and the key and pad bindings
of 2.3 and 2.4. Grip drags call `begin()`, `moveCut`/`setEdge` per move,
`end()` on release; snapping (moments within 8 px, recorded rows, the
playhead) is done here, since it is about pixels.

Every word is in src/strings, `replay.*`, en and es. New keys, with the
Spanish written next to them so package C does not have to invent the
vocabulary (the existing replay words: Clave, Cámara, Guardar, Mis clips):

| key | en | es |
| --- | --- | --- |
| `replay.cut` | Cut | Cortar |
| `replay.uncut` | Uncut | Quitar corte |
| `replay.cut_added` | Cut. Pick this shot's camera: 1 to 6 | Corte. Elige la cámara de esta toma: 1 a 6 |
| `replay.cut_removed` | Cut removed. Z to undo. | Corte quitado. Z para deshacer. |
| `replay.shot_of` | Shot {i} of {n} | Toma {i} de {n} |
| `replay.movie_length` | Movie {time} | Película {time} |
| `replay.enter_cut` / `_blend` / `_glide` | Cut / Blend / Glide | Corte / Fundido / Deslizar |
| `replay.undo` / `replay.redo` | Undo / Redo | Deshacer / Rehacer |
| `replay.export_movie` | Export movie | Exportar película |
| `replay.exporting` | Exporting | Exportando |
| `replay.export_progress` | frame {i} of {n}, about {left} left | cuadro {i} de {n}, faltan unos {left} |
| `replay.export_realtime` | This browser records in real time: a slow computer can drop frames. | Este navegador graba en tiempo real: una computadora lenta puede perder cuadros. |
| `replay.export_no_music` | Engine, wind and crashes. No music. | Motor, viento y choques. Sin música. |
| `replay.export_size` / `_frames` / `_file` / `_sound` | Size / Frames / File / Sound | Tamaño / Cuadros / Archivo / Sonido |
| `replay.hints_html` | rewritten: K cut here, 1 to 6 camera for this shot, drag an edge to move it, Z undo, C export | same, in Spanish |

`replay.add_key`, `replay.remove_key`, `replay.directed`, `replay.key_added`,
`replay.key_removed`, `replay.recording_video` go when nothing uses them.
The Spanish follows the file's tuteo (`Elige`, `Toca`), as the existing strings do.

### 4.5 `export.js` and `soundtrack.js` (package D)

```js
// export.js
export async function exportCapabilities()             // what exportOptions() reports
export async function createExportJob({
  clip, edit, plan, size, fps, format, sound,
  audio,          // the live MotorAudio, read for voice, blade scale, mix and level only
  surface,        // host.exportSurface: (w, h) => restore
  signal,         // AbortSignal from cancelExport
}) -> job
job.next()        // offline: the next frame index, -1 while encodeQueueSize > 4, null after the last
                  // real time: floor(elapsed * fps), skipping as the wall clock says
job.capture(canvas)  // sync: new VideoFrame(canvas, { timestamp, duration }), encode, close
job.progress      // { done, total, etaS, realtime }
job.finish()      // flush, mux, -> { name, bytes: Blob }
job.cancel()

// soundtrack.js
export async function renderSoundtrack({ clip, edit, plan, audio, sampleRate = 48000 }) -> AudioBuffer
```

`renderSoundtrack` builds a fresh `MotorAudio` on an
`OfflineAudioContext(2, ceil(dur * 48000), 48000)`, copies the live one's
voice, blade scale, mix and level, enables it with music off, and schedules
per movie frame `update(rpm * speed, airspeed * speed, i / fps)` from
`sampleAt(clip, plan.clipT[i])`; then `wreck` and `schwing` at
`cueTimes(edit, ...)`, level times `min(1, speed)` as `events()` does.
The audio is rendered first (seconds), encoded with `AudioEncoder` (AAC
when supported and the file is MP4, else Opus) in 20 ms frames, then the
video frames follow.

Video codec by format: MP4 `avc1.640028` (H.264 High 4.0, 1080p capable),
falling back to `vp09.00.40.08` in MP4 if H.264 is missing; WebM
`vp09.00.40.08`, falling back to `vp8`. Bitrate 10 Mbit/s at 1080p60,
6 at 1080p30 and 720p60, 4 at 720p30. A key frame every 2 s.

The muxer writes to an append only target: MP4 `fastStart: 'fragmented'`
and WebM `streaming: true`, each chunk kept as a Blob part, so the movie is
never one ArrayBuffer (a 30 s clip at 0.1x is a 300 s movie, about 375 MB
at 1080p60).

**The real time fallback** (no `VideoEncoder`, or the encoder refused the
config): the job sets the export surface, returns `floor(elapsed * fps)` from
`next()`, and records `canvas.captureStream(fps)` plus a tap on the live
master with MediaRecorder, as `exportVideo` does now. Its progress says
`realtime: true`.

### 4.6 `main.js` hooks (package D)

The only main.js changes, all on the host object the crash cam is given
(around the `createCrashCam` call) and in the frame loop:

* `host.exportSurface(w, h) -> restore()`: pixel ratio 1, renderer and
  `view.post` sized `w x h` without touching the CSS size, camera aspect
  `w / h`, the adaptive quality governor held, the window resize path
  suspended; `restore()` undoes all of it and re-applies a pending resize.
* While an export surface is set: the fps cap is bypassed (every loop
  iteration draws), and the world's own clock (`view.updateWind`,
  `view.updateWaves`) advances by exactly `1 / fps` per drawn frame
  instead of the wall clock, so grass and water move at the movie's pace.

## 5. Export in detail

### 5.1 Why rAF drives it

The world is drawn by main.js's frame loop with its shadow focus, wind,
waves and composer passes. Rendering a movie frame outside that loop would
mean a second, divergent path. So the export runs inside the loop: each
iteration asks the job for a frame, draws it, captures it. Slower than real
time on a weak machine, faster than real time on a strong one, never a
dropped frame. The cost: `requestAnimationFrame` pauses in a hidden tab, so
the export pauses too. The dialog says "Keep this tab open", and the job
resumes when the tab is visible again.

### 5.2 No dropped frames, stated as a check

For a plan of `n` frames the container holds exactly `n` video frames, with
timestamps `round(i * 1e6 / fps)`, in order, whatever the frame time. The
browser check (7.4) runs the export under
`Emulation.setCPUThrottlingRate` 4 and again with an 80 ms busy wait in
every frame, and asserts the same count and timestamps.

### 5.3 Fallback, honestly

MediaRecorder cannot promise frames. It is only used when WebCodecs is
missing (older Safari, older Firefox) and the dialog says so before Export
is pressed.

### 5.4 The muxer dependency

| Library | Licence | Size (min, gzip) | jsDelivr | Status |
| --- | --- | --- | --- | --- |
| mp4-muxer 5.2.2 | MIT | 42.6 kB, 10.3 kB | `https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.min.mjs`, 200 | deprecated in favour of Mediabunny, frozen |
| webm-muxer 5.1.4 | MIT | 46.8 kB, 9.7 kB | `https://cdn.jsdelivr.net/npm/webm-muxer@5.1.4/build/webm-muxer.min.mjs`, 200 | deprecated in favour of Mediabunny, frozen |
| mediabunny 1.61.0 | MPL-2.0 | 689 kB, 177 kB (bundle) | 200 | maintained |

Chosen: the two MIT muxers, pinned to exact versions in the import map
(`"mp4-muxer"`, `"webm-muxer"`), imported dynamically on the first export so
a pilot who never exports never loads them. MIT is GPLv3 compatible. They
are 20 kB together against 177 kB, and a muxer is a finished piece of code:
a pinned, frozen version does not rot. MPL-2.0 would also be compatible;
Mediabunny is the upgrade path if a pinned muxer ever breaks. Both
features used are in these versions: mp4-muxer has `fastStart: 'fragmented'`,
`StreamTarget`, video `avc`/`vp9`, audio `aac`/`opus`; webm-muxer has
`streaming`, `StreamTarget`, `V_VP9`/`V_VP8` and `A_OPUS`. Package D
justifies the dependency in its commit message, per CLAUDE.md.

## 6. Work packages

Four packages, one worktree and one branch each, each opens its own pull
request with `-R fdflabs/fdfpv`. **Every agent verifies this document
against the tree before building on it and reports what it found stale.
"I built nothing, and here is why" is a valid result.**

| | Package | Owns (only these files) | Model |
| --- | --- | --- | --- |
| A | Edit model, undo, file v6 | `src/replay/edit.js` (new), `src/replay/file.js`, `scripts/edit-selftest.js` (new), `scripts/edit-file-check.js` (new), `package.json` (its two script lines), `.github/workflows/checks.yml` (one line) | strong |
| B | Playback, edit clock, export driver, api | `src/replay/crashcam.js`, `src/replay/cameras.js`, `scripts/crashcam-selftest.js`, `scripts/crashcam-e2e.js`, `scripts/edit-play-check.js` (new), `package.json` (its line) | strong |
| C | Timeline UI, dialog, keys and pad, strings | `src/replay/editor.js`, `src/replay/style.js`, `src/strings/en.js` and `es.js` (`replay.*` only), `tests/crash/editor-ui.html` and `.js` (new, a page that mounts `createEditor` on a fake api over the real `edit.js`), `scripts/editor-ui-check.js` (new), `package.json` (its line) | strong |
| D | Offline export, audio, muxers, main.js hooks | `src/replay/export.js` (new), `src/replay/soundtrack.js` (new), `src/main.js` (4.6 only), `index.html` (two import map lines), `tests/lib/moviefile.js` (new, reads frame counts and timestamps out of MP4 and WebM), `scripts/export-selftest.js` (new), `scripts/export-check.js` (new), `package.json` (its lines), `.github/workflows/checks.yml` (one line); after B merges, `crashcam.js`'s `exportMovie`, `exportOptions`, `cancelExport` bodies only, and the video step of `crashcam-e2e.js` | strong |

Shared files and who touches what in them: `package.json`, one script line
per package, and `.github/workflows/checks.yml`, one `run:` line per Node
selftest (A `edit:selftest`, D `export:selftest`; B's is already there as
`crashcam:selftest`), expect trivial rebase conflicts; `src/main.js` is D's alone;
nobody else edits `recorder.js`, `store.js`, `peers*.js`, `paper*.js`,
`journal.js`.

**Starting in parallel.** A is small and should open first, within hours.
B, C and D start at once against sections 3 and 4: B and D import
`edit.js` by the names in 4.1 and rebase when A lands; C builds against its
fake api page and needs neither B nor D to run its check.

**Merge order: A, B, D, C.** A first because everything imports it. B next
because D's crashcam bodies and C's integration sit on B's api. D before C
so C's last pull request wires the dialog to the real `exportOptions` and
runs the whole flow. Each merge re-runs its successors' checks after
rebase. If B slips, D can merge its new files first (they are dead code
until B calls them) and its crashcam bodies after.

## 7. Checks

Node selftests are cheap, run on every change, and go into CI
(`.github/workflows/checks.yml`, which already runs `crashcam:selftest`,
`strings:selftest`, `lint:copy` and `lint:nouns`). The browser checks use
`tests/lib/page.js` only, one headless Chromium at a time on this box.
`npm run verify` is not run unless the owner asks (CLAUDE.md).

### 7.1 A

* `npm run edit:selftest` (Node): every operation returns a new edit and
  leaves its input deep equal to before; cut, removeCut, moveCut, setIn,
  setOut clamp to `MIN_SHOT_S`; `movieDuration` equals the sum of
  `(t1 - t0) / speed` to 1e-12; `clipTime(movieTime(t)) === t` to 1e-9 at
  10 000 random times; `planMovie` for durations 0.05 to 300 s at 30 and 60
  fps: `n`, rising `clipT`, integer microsecond timestamps with durations
  that sum to `round(n * 1e6 / fps)`; `weights` for all three transitions
  (continuous across a blend's end, `w` in `[0, 1]`); history: 250 commits
  keep 200, a gesture of 50 previews is one step, undo then commit clears
  redo; `checkEdit` refuses each bad field with a reason naming it;
  `trimEdit` round trip.
* `npm run edit:file` (browser): in the page, a version 6 clip with an edit
  encodes, decodes deep equal, goes into IndexedDB with `putClip` and comes
  back equal after a reload; a clip without an edit is still written as
  version 3, 4 or 5 byte for byte as before (compared with `origin/main`'s
  `encodeReplay`).

### 7.2 B

* `npm run crashcam:selftest` (extended): `evaluateEdit(fromKeys(keys))`
  equals `evaluateKeys(keys)` at 2000 times (position 1e-9 m, attitude
  1e-9, fov 1e-9) for four keys of four rigs, run before `evaluateKeys`
  is deleted and kept as a fixed table after; a blend's pose at its
  midpoint is the documented mix.
* `npm run edit:play` (browser): the real page, a crash, V; cut at 4 s and
  set Orbit; the camera at 3.9 s is the chase's pose and at 4.1 s the
  orbit's; a 0.25x shot advances clip time by 0.25 / 60 per movie frame;
  a stub job whose `next()` holds every other call still gets every index
  once, in order; a saved v1 to v5 clip with keys opens with the same
  camera as before.
* `npm run crashcam:e2e` (updated for K as cut and the export api) passes.

### 7.3 C

* `npm run editor:ui` (browser, the fake api page): the strip has one block
  per shot with its rig's class and label; K, 2, Del, Z, Shift+Z, T, Comma
  and Period change the edit as 2.3 says; a pointer drag of a grip by
  100 px moves the cut by the expected time and is one undo step; the
  dialog opens on C, Enter starts, Esc cancels; the same with a stubbed
  standard pad (Y, X, LT, RT, Back, Start, L3); every `replay.*` key exists
  in en and es; `npm run strings:selftest` (en and es have the same keys
  and placeholders), `npm run lint:copy` and `npm run lint:nouns` pass.
* `node scripts/shots.js` pictures of the editor with four shots, in en
  and es, for the owner (not committed).

### 7.4 D

* `npm run export:selftest` (Node): the job's frame schedule for the plans
  of 7.1 (no gaps, no repeats, holds only while the queue is over the
  bound); the bitrate table; codec choice given capability tables for
  Chromium on Linux, Chromium on Windows, Safari and Firefox as measured
  or documented; `moviefile.js` against small fixture files written
  with the muxers' `addVideoChunkRaw` in Node; if a muxer will not load in
  Node, the fixtures come from one browser run and are generated, not
  committed as binaries.
* `npm run export:check` (browser): the real page, a crash, an edit of
  three shots with a 0.25x shot and a blend, exported at 720p30 as MP4 and
  WebM: the container holds exactly `plan.n` video frames at
  `round(i * 1e6 / 30)` microseconds, frame size 1280 x 720, an audio
  track about the movie's length; the same count and timestamps with
  `Emulation.setCPUThrottlingRate` 4 and with an 80 ms busy wait per
  frame; cancel midway leaves no download and restores the canvas size;
  the wall time per frame is printed.

## 8. Risks

1. **The box and the reviewers see a software rasteriser.** Headless checks
   prove counts and timestamps, not how the movie looks or how fast a GPU
   exports. The owner exports one real crash and watches it: that is the
   acceptance test, and it is asked for, not assumed.
2. **Codec availability differs by platform.** AAC is missing on Linux
   Chromium (measured), H.264 on some Firefox builds. The dialog reports
   what it will produce before Export; an Opus in MP4 file may not play in
   old players.
3. **Memory on long slow motion movies.** 300 s at 1080p60 is about
   375 MB of chunks. D measures the peak with `performance.memory` in the
   check; if Blob parts do not keep it bounded, the movie is capped at
   120 s with a message, decided with the owner.
4. **A hidden tab pauses the export** (5.1). Stated in the dialog.
5. **main.js is the busiest file in the repository.** D's diff there is
   kept to 4.6; any other branch touching the resize path or the fps cap
   conflicts with it. D rebases late and re-runs its check after.
6. **Changing the meaning of K, Del, 1 to 6 and Up Down.** Pilots who used
   keys get cuts. Old clips keep looking the same (3.4), and the hints line
   and toasts say what happened. The owner flies it and says if it reads.
7. **Version 6 files do not open in older builds.** Only a clip with a
   real edit is written as version 6; the site deploys one build, so this
   matters only for files sent to a friend on a stale tab.
8. **Preview versus export of the world.** Grass and water follow the wall
   clock in the preview and the movie clock in the export, so their phase
   differs; the camera, cuts, speeds, craft, wreck, debris, smoke and paper
   match frame for frame (4.3).
9. **Deprecated muxers.** Pinned and frozen; Mediabunny (MPL-2.0) is the
   replacement if one ever fails on a new browser.
