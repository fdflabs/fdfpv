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

Since file version 18 a clip also names the app build that flew it (the header's `build`: the deploy's
stamp that Settings and the credits show, null on a page served from a checkout), taken when the replay opens
on the live recording, so a clip opened from an older file and saved again stays unknown rather than taking
the build that edited it. The git blob id above names only dist/sim.wasm, which many deploys share while
their maps, screens and checks differ. My clips shows it after the map ("build unknown" for a clip saved
before it) and replay:refly prints it above the module's id. It is the first field only the header holds;
file.js HEADER_ONLY is the one rule for such fields (a file of that version or later has it, an older one
never does), so the next one is a row there, not another version special case.

### The AI opponent in a replay (file version 19)

Added 2026-10-13 (w39 replay v19). A solo race's AI opponent (src/game/aiopponent.js) is now in the replay
of that race: drawn as the translucent racing ghost it was (src/render/ghostcraft.js, labelled AI opponent),
where the race drew it, and flown again by replay:refly.

- Every crash cam row keeps the ghost's pose as the frame drew it, which race it is (a run: a new AiOpponent at
  every lap the race opens from scratch), its own clock, how many of its 4 ms stick rows it had flown, its plant's
  state hash and where its journal stood (src/replay/opponent.js). Its 4 ms sticks are copied in as flown, so a
  clip never needs the opponent to still exist when the replay opens.
- Its kept sticks are float32, rounded from the doubles sim_input took, so they alone do not fly it again (the
  rows did not either, for the pilot: its ground and its contacts are calls too). What flies it is its journal:
  the opponent's plant is its own dist/sim.wasm, journaled from the moment it is loaded (seatOpponent, before
  anything allocates), its region copied once a second of its own clock (stepTo), the learning run before the
  first copy and so never written down. A clip keeps that journal's stretches from the first row it names, the
  very refly the pilot's is (src/replay/refly.js; reflyOf takes the rows' marks, reflyRun the rows' hashes).
- Saved, a clip with an opponent is file version 19: the header's `opponent` ({ runs: [{ laps, crashed }],
  sticks, refly? }) and after everything else its rows, pose, sticks and, with a refly, its marks and deflated
  stretches. Its columns are the newest layout's, so it needs the sticks and the animation clock, and its version
  is past 18's, so it carries the app build: file.js HEADER_ONLY already says a file of version 18 or later has
  one, so there is no rule of its own for that. The opponent itself is not a HEADER_ONLY row: it has columns. A
  clip without an opponent is the version 18 file, byte for byte; versions 1 to 18 are read without one. A trim
  keeps it (its sticks and stretches whole, as the pilot's refly), and a trim that leaves it no row drops it.
- Refused: an opponent in a file older than 19, a version 19 file without its opponent (or its build), an
  unknown field, a lap that is not a time, a row naming a race or a stick the file does not have or going back to
  an earlier race, a pose or a stick that is not one, an opponent that races in no frame, a file cut short.
- A run whose plant was seated again before the clip was cut (another aircraft or pack) keeps its pose and
  sticks; its rows cannot be flown back to, as a journal that is gone cannot be kept.
- My clips says "against the AI opponent" after the build. Its laps are its own Race's, kept per run as the
  last row of that run saw them, and never the pilot's record.
- **Size.** Measured: in the replay:refly self test, 30.0 s at 62.5 rows a second, the opponent added 1.07 MB
  to a 0.97 MB clip (its refly 0.85 MB deflated: about 140 kB of region and 23 kB a second of calls, as the
  pilot's; sticks 0.12 MB; rows, pose and marks 0.10 MB). In the page (crashcam:e2e, 13.0 s, 778 rows) it added
  0.58 MB to 0.81 MB. So a full 30 s race clip about doubles, to about 2 MB, and My clips' forty grow by about
  45 MB at most if every one is a race against the opponent.
- **Cost in the page.** Measured 2026-10-13 on batch/2026-10-14 at 53b54b250, headless Chromium on GPU 1, High,
  1600 by 900, drawing on: the interceptor on crashcam:e2e section 7's ring (tests/fixtures/map-track-v4.json,
  the reference lap at 8 m/s), the pilot holding at the first gate, the Ghost row on AI opponent against the
  same race with it off, every requestAnimationFrame callback timed and summed per frame, AiOpponent.stepTo and
  the opponent's journal.snapshot wrapped from the module the shell imported. Two pairs, 15 s and 30 s:
  - the frame's main thread work, median 3.9 and 4.1 ms without, 4.3 and 4.8 ms with (average +0.36 and
    +0.65 ms, p99 5.1 and 5.5 against 5.7 and 6.1 ms); of that, stepTo (16 or 17 plant steps a frame at
    60 Hz) is 0.10 ms a frame at the median, 0.5 at the 99th percentile, 1.1 at most; the rest is not stepTo
    and was not split further (the ghost craft's draw and the journal's own garbage are the candidates);
  - the once a second copy: the first, which copies the whole region twice (`head` and `base`), 1.6 ms in both
    runs; every later one compares the region word by word and copies the pages that changed, 0.38 to 0.49 ms
    on average and 1.0 ms at most over 47 copies. Frames with a copy averaged 5.6 and 5.9 ms of main thread
    work. Under one 11.1 ms frame (90 Hz) by ten times, so the copy stays on the frame: no worker, no chunking;
  - memory held: the region is 1.69 MB (stack base 65,536 to the heap's base 1,758,160), the opponent's own
    module's memory 18.5 MB, and its journal 6.2 MB after 17 s and 8.7 MB after 32 s (two copies of the region
    3.4 MB, calls about 120 kB and changed pages about 47 kB a second), held at about 9 MB once its 33 kept
    stretches are full. So about 27 MB in the page, held from the moment the opponent is seated until it is
    seated again for another aircraft or pack (main.js keeps `aiSeat` across races), not 10.
  Not measured: the opponent flying beside a pilot who flies (the pilot held still), and a slower machine. The
  probe was a script outside the tree; its method is the paragraph above.

`npm run replay:refly -- CLIP.fdfreplay [--wasm new.wasm]

`npm run replay:refly -- CLIP.fdfreplay [--wasm new.wasm] [--old clip-build.wasm] [--transplant] [--every s]
[--json out.json]` first flies it again, exactly, on the build that recorded it (the module given if it is that
build, else `--old`, else `git cat-file blob <id>` from this checkout), on a
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
- **Through a changed plant (added 2026-10-13, w38 replay refly2).** When the module given is not the clip's
  build (or with `--transplant`), the clip is then flown twice more: once on the clip's build and once on the
  new one, each set up the same way and started in the same state. "Set up" is the clip's setup log: the text
  of the last sim_init and every call the shell made since it except the every-step ones (sim_input,
  sim_step, sim_set_ground, sim_set_ground_material, sim_damage_events, the air the weather sets before
  every step (sim_set_wind, sim_set_air_vertical) and the sim_wing_gear reader), each
  with where it fell in the journal's stretches, so only the calls made before the first row are made. The
  state is the clip's own at that row, from the exact re-fly, put in with sim_set_pose and sim_set_velocity;
  then the journal's calls from that row on are made again, the sticks' timestamps moved onto the new
  module's clock. What cannot be carried into another build starts fresh: the controller's filters and
  integrators, the motors, the pack, damage. That is the transplant's jolt, the same on both builds, so the
  tool reports two comparisons: the clip's build transplanted against the recording (the jolt, what the
  method costs) and the new build transplanted against the clip's build transplanted (what the fix changes),
  with a table every `--every` seconds and where each pair first parts.
- **The setup log's size.** The shell declares the world again round the craft about twice a second (a clear,
  then the trees, clumps, wires and solids near it); a clear makes the declarations of its kind before it moot,
  so those made before the oldest kept stretch are dropped as the journal runs, and those before a clip's
  first stretch when the clip is cut. Measured in headless Chromium on swiss2 (2026-10-13): after 70 s of
  flight the log held 45,239 doubles (6,119 calls, 0.36 MB) on the Interceptor and 65,159 (8,502 calls,
  0.52 MB) on the Timber, steady, nowhere near its 2^20 double bound; most of it is the river's channel
  (4,766 sim_water_channel_point calls at load) and the world's clumps. In a saved 3 s Timber clip it was
  5,434 calls, 299 kB raw, 104 kB deflated, beside a 5.7 kB sim_init text.
- **How big the jolt is.** On the replay:sticks Timber clip, transplanted onto its own build: 0.13 m and 0.5
  degrees from the recording after 3 s in one run, 0.89 m and 2.8 degrees (11 deg/s on the rates from the
  first 0.1 s) in another, so it depends on what the fresh controller meets at the first row; it is why the
  verdict is the two builds against each other. On the self test's 30 s Skyhunter flight: 1.7 m and 1.7 degrees after 30 s, while a
  build with the air density changed parts from the clip's build by 25.7 m and 26 degrees.
- A clip saved before the setup log was kept (an early version 17 file) flies exactly on its build and is
  refused for a transplant with that reason.
- A row before the first kept copy, or in a stretch the journal stopped writing (a sim_init, the recording
  switched off), cannot be flown back to, and the tool counts them.
- Verified: a clip saved in headless Chromium (npm run replay:sticks) re-flies in Node with every row bit for
  bit, which is the Node and browser determinism CLAUDE.md requires, on a real recording.
- An old clip (version 1 to 16) is read as before and refused by replay:refly with what it holds instead.
- A version 19 clip's AI opponent is flown too, on its own fresh module of its own build (refused by its id
  otherwise): every row it raced in hashed against its recorded hash, the region held to its journal's copies,
  and at each row the last sim_input its journal made held to the stick row it kept there. Its laps are printed
  as its Race closed them. Exit 0 only when the pilot and the opponent both match.

### The war's map in a replay (file version 21)

Added 2026-10-14 (w40 replay v21). Two things the room sends were missing from a clip's war map
(src/replay/warrec.js), so a replay drew the match otherwise than the live screen had:

- **The order putting the station's lights out** (The Long Night's twist A): the war view's `stationDark`, the
  room ms the dam's own districts went out by order (src/share/war/stationdark.js). crashcam.js tapWar now hands
  it to the recorder with the restores, and warrec.js world() keeps it on the match, the latest the view named
  (a null, every match but that twist's, keeps none and never takes one back). world.js matchAt already applied
  it; now the clip has it to apply.
- **A damage event by an attacker's kind**: edge/rooms/war.js strike sends `by` as the attacker's kind,
  'defender' or 'hoist'; damageOk takes a string of up to 40 characters, where clips before held a number or
  null.
- **How a version 21 file is told.** A clip is version 21 when a match of its war map has a `stationDark` or a
  damage event whose `by` is a string, and only then; the reader holds the header to the same rule both ways. So
  a build before this one refuses such a file by its version ("version 21, this build reads 1 and ... and 20",
  the screen's reason `version`), never as a damaged file. Its columns are the newest layout's, so it needs the
  sticks and the animation clock, and its version is past 18's, so it carries the app build. A clip with neither
  is written as the version before (20 with restores, else 18 and older), byte for byte, and versions 1 to 20
  are read without them: their replay leaves the station lit. A trim keeps the order.
- Refused: either in a file older than 21, a version 21 file with neither, an order that is not a room ms, a
  `by` over 40 characters.

### Hurt and spotted hulls in a replay (file version 22)

Added 2026-10-15 (w47 replay marks). Mission 5's carrier burns after its first hit (src/main.js, the explosions'
burn over its deck, driven by roomwar.js's `hp` on attackersAt) and a spotted one is marked LAUNCHING or EMPTY
HULL (`spotted`, src/ui/warmarkers.js). A clip's war kept neither, so the crash cam replayed every hull whole.

- **What is kept.** Each scripted attacker in a clip's war may hold `hurt`, [{ at, hp }], every hp it was drawn
  with and the room ms of the first live frame that drew it so, and `spotted`, { at, how } ('launching' or
  'silent'). src/replay/warrec.js draw() takes them from what the frame drew (crashcam.js tapWar wraps the
  attackers layer's update), whatever the screen, as births are. Not from the room's ops: the live screen
  draws them from the frame after it heard the op, a late joiner from its welcome's `hurt` and `spotted`, and
  roomwar emits no event for a spot. A hull never mends and is never unspotted, so neither goes back.
- **What a replay does.** warrec.js warAt puts `hp` and `spotted` on each attacker as attackersAt does, from
  the entry at or before the row's room ms, so a row has them exactly as the live frame at that row drew them.
  src/replay/warscene.js burns each one with an hp over its deck at the frame's step, as main.js does at its
  dt: while the replay plays forward, none on a jump or a still frame (after a jump the column grows back).
  The spot rides on the attacker drawn; the war's markers are the flight screen's HUD and are not drawn over a
  replay (warscene.js, main.js hands warMarkers null off the flight screen), so no mark is drawn on it.
- **How a version 22 file is told.** A build before this one refuses an agent with a fourth key as a damaged
  file, so a clip is version 22 when an agent has `hurt` or `spotted`, and only then; the reader holds the
  header to the same rule both ways, and the build before refuses it by its version ("version 22, this build
  reads 1 and ... and 21", the screen's reason `version`). Its columns are the newest layout's, so it needs the
  sticks and the animation clock, and it carries the app build. A clip with neither is written as the version
  before, byte for byte, and versions 1 to 21 are read without them: their replay draws every hull whole.
- **The room's birth records.** Every birth the stage graphs send carries `wave`, and some `meet`, `wire`,
  `sector`, `az`, or a launch's `from`, `parent` and `group`. checkWar took only the eight original keys, so
  every real war clip since the stage graphs was written and then refused on reading as a damaged file. It
  now takes those, each of its kind; no version, since the writer never changed.
- Refused: either in a file older than 22, a version 22 file with neither, an hp below 1, hit points out of
  room ms order, an empty hurt, a spot that is neither launching nor silent, a birth field of the wrong kind or
  one the room never sends.

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
- `npm run crashcam:selftest` (section 29): two of The River Below's hulls drawn hurt and spotted as tapWar
  records them (one hurt before any row), each kept once at the room ms of the first frame that drew it; a
  replay whole and unmarked before that row and hurt and marked from it; the version 22 round trip bit for bit,
  either alone enough for it, a trim keeping copies; the same war with neither still the version 18 file; the
  refusals above by their messages, version 23 refused by its version. Section 17: a birth record as the room
  sends it read back as it was.
- `npm run war:grid` (marks): The River Below played on the room by four bot pilots (war-balance.js runOne,
  seed 2: both hulls spotted, one silent, both hit once), framed at 60 fps into the real client and recorded
  through the real ring: 34262 rows, 0 where an attacker's hp or spot differs from the live frame's; without
  them 3622 differ (the control). Two rows after the one launch draw its children before the live frame heard
  their birth (a replay draws a birth from its t0, the live screen from the message a room tick later): shown,
  and not this change's.
- `npm run replay:world`: a hurt hull in a clip burns in the replay's scene (three.js in the page) from its
  row on while it plays, none before it and none on a still frame, its puffs still alive at the end (a clip
  with no explosions of its own used to clear the air every frame: 0 alive before the fix).
- `npm run crashcam:selftest` (section 28): the order and a damage event by a kind recorded as tapWar records
  them, a later null not taking the order back; a replay with the station lit before the order and out after
  it; the version 21 round trip bit for bit, either alone enough for it, a trim keeping the order; the same war
  with neither still the version 18 file and section 27's version 20 file read and written the same bytes; the
  refusals above by their messages, either in a version 20 file and a version 21 file with neither first.
- `npm run war:grid`: The Long Night's twist A recorded through the real recorder, the clip keeping the order
  and its replay the live frames bit for bit at every row; without the order the same clip differs (the
  control).
- `npm run crashcam:selftest` (section 26): the opponent's ring (a row before it raced is none, a race opened
  again is a second run, the sticks of both in one column with each row naming the one in force), drawn between
  two rows of a run and never across two, the version 19 round trip bit for bit beside the build, the same clip
  without it the version 18 file byte for byte, a trim, My clips' line in English and Spanish, and the refusals
  above, an opponent in a version 18 file and a version 19 file without its opponent first.
- `npm run crashcam:selftest` (section 25): the app build, a stamp and a checkout's null each through the
  version 18 round trip bit for bit; the same clip without one still version 16, the same bytes, shown as
  "build unknown"; a trim keeps it; refused: a version 18 file without its build, one in a version 16 file,
  one that is a number, over 40 characters or with characters no stamp has, and on the way out one without
  sticks.
- `npm run crashcam:selftest` (section 23): the sticks ring, quantising, sampling, trimming, the version
  16 round trip bit for bit, a clip without sticks still written as before, the refusals, and the export
  read back by parseCsv and loaded by Compare sticks.
- `npm run replay:sticks [OUT_DIR]` (browser): a Timber flown through four stick settings with a flap
  notch, the replay's nubs where each setting puts them, the Sticks CSV button pressed with a pointer,
  saved and replayed as version 18 (its row naming a checkout's null build) and the saved file flown again in Node by replay:refly, bit for bit, then
  transplanted twice onto the same build from its setup log, the two flights the same, an old clip played with its note, the gimbals clear of the rest of the
  screen at 1280 by 720 and 800 by 600, and the export read by /dev/hover.html. Leaves pictures in OUT_DIR.
- `npm run replay:refly:selftest` (CI-able, Node, about 2 s): a 40 s scripted Skyhunter flight recorded
  through a journaled module as the crash cam records it, saved as version 17 (no app build, the old clip)
  and as version 18 (with one, the same refly), a build in a file that says 17 refused, and the 18 read back
  and flown again:
  every row's hash and every copy match, and a clip trimmed to 10..20 s too. Negative controls: gravity
  changed by 0.2 % after the copy is written differs from the first row and parts by 0.76 m over 30 s; a
  build with the airframes' air density changed is refused by its id, flies 27 m away from the original from
  its own start, yet the clip's region written into it flies the old plant bit for bit. Transplanted twice onto
  its own build the clip flies identically, the transplant starts exactly in the recording's state and its
  jolt is reported; transplanted onto the changed build it parts from the first rows; the world declared
  twice a second keeps only the declarations a clip can need. A version 16 clip is refused with its reason,
  and a file cut short or with a mark outside its stretches is refused on reading. Section 8: an AI opponent
  raced beside the clip as the page races one (the interceptor on the ring, a lap closed, then a race opened
  again into a wall, so contacts are in its journal), saved as version 19: every row it raced flies back bit
  for bit, its kept sticks are its journal's sim_input calls, and negative controls (a kept stick or a hash
  changed, another build) are caught.
- `npm run crashcam:e2e` (section 7, `--opponent-only` runs it alone): the interceptor on the ring with the
  Ghost row on AI opponent; the replay draws the opponent's ghost where the race drew it last and through the
  clip; saved as version 19 with My clips saying so; the saved file flown again in Node, the pilot and the
  opponent each bit for bit; what the opponent adds to the file printed.
