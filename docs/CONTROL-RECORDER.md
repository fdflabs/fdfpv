# Control recorder and hover viewer

Contract, 2026-10-09 (w34 control feel lane). The owner's own hover attempts are the calibration the
person-paced pilot in `scripts/hover-probe.js` lacks: its count is relative (it moves 8 to 96 of 336
pilots on its delay alone), and only real flying says how hard the sim is against reality.

## What the pilot sees

- Settings, Pilot, Diagnostics: the existing **Flight log** switch now also runs the control recorder.
  No new setting.
- A new row under it, **Download control recording**, saves a CSV of the last minute of flight.
- Each run that ends (a restart, which a crash leads to) is kept in this browser as the **last flight**,
  so an attempt that ended in the ground can still be opened and sent.
- `/dev/hover.html` opens a saved CSV or the last flight. It plots the sticks against the nose off
  vertical and the roll rate, and prints the thumb numbers below.

## Sticks on the flight overlay

Added 2026-10-12 (Foundations #11, slice 3).

- Settings, Pilot, Sticks: **Show sticks** (off by default) puts the two stick gimbals over the flight
  for every input. Keyboard and mouse flying shows them whatever it says, as before.
- **Compare sticks** opens a control recording and plays its sticks as a slate ring on the same gimbals,
  under the pilot's amber nub, from the first frame this run is in the air (src/ui/stickref.js). A clock
  that goes back (R, a new run) starts it again; past its last row the ring goes. Choosing the row again
  puts it away. It lives for the session only, and a loaded recording shows the gimbals too.
- `node scripts/hover-probe.js --csv <dir>` writes each mode's best person paced pilot as
  `hover-probe-<aircraft>-<tune>.csv` in this format: rows every 4 ms (the probe's step), frame and wall
  clock columns empty. Open it at `/dev/hover.html` or in Compare sticks.

## Sticks in replays

Added 2026-10-12 (w37 replay sticks). The owner saved a replay because what the airplane did against
what his sticks showed looked strange, and a clip then kept the throttle and nothing else.

- Every crash cam row now keeps the pilot's roll, pitch, yaw and throttle as the overlay draws them (the
  shell's input channels), the flight mode (the OSD's: AS3X, stabilised, manual, angle, acro, turtle), the
  flap switch's notch, and the plant's velocity and body rates (src/replay/sticks.js). Sticks are int16
  (1/32767 of travel, far under the radio's 11 bits and the 1.2 % deadband), mode and flaps int16, velocity
  and rates float32: 36 bytes a row, about 130 KB on a full 30 s clip at 120 Hz, a tenth of a solo clip.
  My clips' forty (MAX_CLIPS) grow by about 5 MB at most.
- A saved replay with them is file version 16 (src/replay/file.js). A clip without them is written as
  before, byte for byte, and versions 1 to 15 still load: their replay has no gimbals and says the clip
  was saved before replays kept the sticks.
- With the replay's OSD on (H), the same two gimbals as the flight overlay sit bottom right over the dock,
  in the viewer's stick mode, the nubs moving with the replay, the mode and the flaps named under them. A movie export does not carry
  them; it never carried the OSD.
- **Sticks CSV** in the replay's Keep row downloads the movie's range (In to Out, what Save keeps) in this
  file's control recording format, one row a clip row: t_s is the clip's clock (the plant's time where it
  ran on, so a restart inside the clip does not send it back), frame the row's index, then the sticks, the
  surfaces (sim_plane_surfaces order, zero on a quad), position, attitude, velocity and rates. The frame's
  wall clock, its step count and the stick's read time are not in a clip and are left empty. The file opens
  at `/dev/hover.html` and in Compare sticks.
- The mode and the flaps are not CSV columns (this format has none); they are in the clip.

### Flying a clip again (replay:refly)

Added 2026-10-13 (w38 replay rerun). The owner reports physics by saving a replay; the lead needs to fly that
clip again headless, on the plant, not just read its rows.

The rows alone cannot do it, and a clip saved before file version 17, or the CSV it exports, still cannot:

1. The inputs at the plant's rate. A row holds one stick sample a drawn frame (up to 120 Hz, often 30 to 60).
   The plant took them on the 250 Hz RC grid over 1 ms steps, and the slots between frames are not kept.
2. The starting state. A row holds the plant's position, attitude, velocity and rates only: not the
   controller's state (AS3X, the stabiliser, Betaflight's filters and integrators), the motors and servos, the
   battery, the wind, the damage state as the plant holds it.
3. Every other call the shell made into the plant over the clip (mode, tune, power and flap changes), in order.

The crash cam's journal (src/replay/journal.js) holds exactly that, in memory, for TAKE OVER: a copy of the
plant's whole region once a second and every call since. Since file version 17 a saved clip keeps it
(src/replay/refly.js): the region at the copy before the clip's first row, each later copy's changed pages,
every call from there, each row's place in those calls, and which dist/sim.wasm flew it (its git blob id).
Deflated, about 140 kB for the region and 22 kB a second for the rest (a Timber on swiss2, measured
2026-10-13), so a full 30 s clip grows by about 0.8 MB and My clips' forty by about 32 MB at most. A clip is
cut with it when the replay opens (while the journal still holds what its rows name) and it is packed when
the clip is saved; trimming keeps the whole of it and moves the rows' marks.

`npm run replay:refly -- CLIP.fdfreplay [--wasm sim.wasm] [--every s] [--json out.json]` flies it again on a
fresh module: the region written in, the calls made again, the plant's state block read at every row and
hashed against the hash the row recorded, and at every journal copy the flight passes the whole region held
to that copy byte for byte (except the 460 bytes malloc keeps its own state in, which are the shell's
heap and not the plant). It prints position, attitude, velocity and rate differences against the recording
every `--every` seconds and at the first row that differs, then a summary: rows flown, rows bit for bit,
where the two first part past 1 cm, 1 degree, 0.1 m/s and 10 deg/s, and the worst of each. Exit 0 only when
every row it can fly matches.

- **Only on the build that flew it.** The region holds every static in the module, its airframe tables among
  them (plant.c's `.rho = 1.225` is data). Written into another build it either does not fit or puts the old
  constants back and flies the old plant, bit for bit: the self test proves both. So a module whose git blob
  id is not the clip's is refused by that id, never by its layout happening to match, and the tool prints the
  `git cat-file blob <id>` that gets the right one back.
- **What it does not do yet: fly the clip through a changed plant.** Answering "does this fix change the
  owner's fall" needs the new build started in the clip's state, and the state only exists as the old build's
  memory. That needs the clip to carry the calls that set the flight up (the sim_init diff, the airframe,
  tune, power and world calls since the last sim_init) so a new build can be set up the same way and placed at
  the first row; it is not built.
- A row before the first kept copy, or in a stretch the journal stopped writing (a sim_init, the recording
  switched off), cannot be flown back to, and the tool counts them.
- Verified: a clip saved in headless Chromium (npm run replay:sticks) re-flies in Node with every row bit for
  bit, which is the Node and browser determinism CLAUDE.md requires, on a real recording.
- An old clip (version 1 to 16) is read as before and refused by replay:refly with what it holds instead.

## Data

One row per 1 ms plant step, in flight (not on the launch stand or a perch). Columns
(`src/share/controlrec.js` COLUMNS):

| Column | Meaning |
|---|---|
| t_s | sim time of the step's end, s |
| frame, frame_wall_ms, frame_dt_ms, steps | the frame that stepped it: its count, its start (performance.now ms), the wall time it stepped, how many steps |
| stick_wall_ms | when the shell's poll read the stick sample in force for this step |
| roll, pitch, yaw, throttle | the channels sim_input was handed for the step (after the stick map, the 1.2 % deadband and the 250 Hz RC grid) |
| ail_l, ail_r, elev, rud | the control surfaces after the controller (AS3X, stabiliser, mixes), radians; 0 on a quad |
| x y z, vx vy vz, qw qx qy qz, p q r | the plant state block (sim_abi.h): world position and velocity, attitude, body rates |

- Held in a preallocated Float64Array ring of 60 000 rows (60 s, about 13 MB, allocated only when the
  switch is on), so the flight loop allocates nothing for it.
- The last flight is stored in IndexedDB (`fdfpv-controlrec`), not localStorage: a minute is past
  localStorage's quota. Only this browser; nothing syncs and nothing goes to a server.
- `src/share/flightlog.js` (the blackbox CSV, one row per frame) is unchanged: other tools read its
  columns.

## Thumb numbers (thumbStats)

The same numbers `scripts/hover-video.js` prints for the probe's pilots, so the owner's flying and the
probe's can be laid side by side:
- per stick: mean and peak absolute deflection (throttle about its mean), stick rate peak and 95th
  percentile (travel per second), reversals per second (half turns, as hover-video counts them);
- the sticks are judged on a 50 Hz grid and a reversal needs 1 % of travel, so a radio's last bit of
  noise is not counted as a thumb changing its mind;
- latency: per frame, its start less the newest stick reading it stepped; and the frame interval.
  Median, p95, p99, worst;
- hover: the longest stretch with the nose within 20 degrees of vertical, the probe's hold criterion.

## Builds on

The flight log switch and the Diagnostics rows (`src/ui/items.js`), `downloadText`, `stampSticks` (the
RC slots) and `stepInAir` (the per step loop) in `src/main.js`, `sim_plane_surfaces`.

## Does not

Change physics, the RC grid or what reaches sim_input (recordings and war:legacy stay bit identical).
Upload anything. Record when the switch is off. Replace the flight log.

## Checks

- `npm run controlrec:selftest` (CI): row alignment with the RC slots, the ring, the CSV round trip,
  and thumbStats on a known sine with radio noise.
- `npm run controlrec:check` (browser, run-check-slot): the real shell, flight log on, a hover with the
  roll stick stepping; one row per step, rolls equal to the stick given, unit quaternions; the Download
  row pressed with a pointer hands over a CSV that parses; a restart keeps the last flight; the viewer's
  Last flight button, pressed with a pointer, shows it.
- `npm run actions:golden`, `npm run war:legacy`: unchanged.
- `npm run crashcam:selftest` (section 23): the sticks ring, quantising, sampling, trimming, the version
  16 round trip bit for bit, a clip without sticks still written as before, the refusals, and the export
  read back by parseCsv and loaded by Compare sticks.
- `npm run replay:sticks [OUT_DIR]` (browser): a Timber flown through four stick settings with a flap
  notch, the replay's nubs where each setting puts them, the Sticks CSV button pressed with a pointer,
  saved and replayed as version 17 and the saved file flown again in Node by replay:refly, bit for bit, an old clip played with its note, the gimbals clear of the rest of the
  screen at 1280 by 720 and 800 by 600, and the export read by /dev/hover.html. Leaves pictures in OUT_DIR.
- `npm run replay:refly:selftest` (CI-able, Node, about 2 s): a 40 s scripted Skyhunter flight recorded
  through a journaled module as the crash cam records it, saved as version 17, read back and flown again:
  every row's hash and every copy match, and a clip trimmed to 10..20 s too. Negative controls: gravity
  changed by 0.2 % after the copy is written differs from the first row and parts by 0.76 m over 30 s; a
  build with the airframes' air density changed is refused by its id, flies 27 m away from the original from
  its own start, yet the clip's region written into it flies the old plant bit for bit. A version 16 clip is
  refused with its reason, and a file cut short or with a mark outside its stretches is refused on reading.
