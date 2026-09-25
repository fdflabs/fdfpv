# Crash physics: the plan and its loop

The owner asked for complex, real crash physics, and a loop that keeps
going until crashing works perfectly. This is the plan, the definition of
"perfectly" the loop is held to, and the order of work. Like
docs/SWISS2-LOOP.md it is also the record: every round's results are
appended here.

## What a crash is today

- Contact is one rigid body against the ground plane, obstacles and (since
  the floats) water: an eight corner box per airframe, sequential impulses
  with restitution that falls with closing speed and Coulomb friction
  (src/native/sim.c `contact_impulse`), plus wheels and floats for the
  aircraft that have them.
- Nothing breaks. A prop that hits the ground keeps its thrust; a wing that
  hits a pole at 25 m/s bounces off whole.
- The shell's "Crashed" is a detector, not physics: a clip into geometry or
  a thrash sets `crashed`, freezes the craft on the glitch pose, shows the
  banner and re-seats it (src/main.js `beginClipCrash`). The quad's
  recovery is Betaflight's crashflip (turtle mode).
- The floats flagged what water cannot do yet: no nose dig flip, no
  cartwheel off a float, no capsize (docs/FLOATS-STAGE1.md).

## What a crash should be

A crash is the same physics as flying, carried on past the point where
parts fail:

1. **Parts, not a box.** Every airframe is a small set of rigid parts
   (quad: frame, four arms, four motor and prop sets, battery, camera, FPV
   antenna; plane: fuselage, each wing panel, tail, prop, motor, battery,
   canopy, gear legs or floats), each with its own collision hull (convex,
   from the drawn model's dimensions, reconciled the way the Skyhunter's
   hull was) and mass, joined by joints with a strength.
2. **Damage from loads, not from a rule.** Each joint and part has limits
   from the material (carbon plate, foam, plastic prop, aluminium boom):
   an impulse or a bending moment past the limit breaks it; below it, foam
   crushes (absorbing energy, permanently deforming) and props chip. The
   limits come from published material data and, where it exists, impact
   testing (drone ground collision studies, FAA ASSURE work, RC crash
   footage measured frame by frame), each with its source.
3. **Damage changes flight.** A chipped prop loses thrust and shakes (the
   gyro sees it, so Betaflight fights it); a bent arm tilts its thrust; a
   lost prop makes a quad unflyable in a way Betaflight cannot save; a
   broken wing panel spins a plane in; a lost aileron or elevator, a
   cracked canopy, a camera knocked askew (the FPV picture tilts), a video
   antenna knocked off (the feed breaks up), a battery ejected (power
   gone).
4. **Detached parts are bodies.** A prop, a panel, a battery that leaves
   keeps flying, bounces and comes to rest, in the plant, deterministic, a
   bounded number of them.
5. **The world answers.** Grass, dirt, asphalt, rock, snow, water, trees
   and buildings have their own friction, restitution and give; tree
   branches catch and hold a plane; water digs a float in and flips it;
   soft ground absorbs more than concrete. Dust, grass, spray and splinters
   show where it happened.
6. **The shell stops faking it.** No freeze and re-seat for a real crash:
   the wreck comes to rest where physics puts it, the pilot sees it from
   the camera it has left (or the chase camera if the FPV camera is gone),
   and resets to the pad or respawns by choice. Crashflip stays for a quad
   that can still fly. Race rules decide what a crash costs.
7. **Everything stays deterministic.** No JS maths in the physics path;
   Node and Chrome traces bit identical; a flight without a damaging
   contact bit identical to today, so every existing gate, recording and
   verify hash stays valid until a damaging contact happens. Recordings
   that contain crashes are re-recorded deliberately, in commits that say
   so, never silently.

## What "works perfectly" means: the crash suite

The loop is held to a suite of named crash scenarios, each run
deterministically in Node (and the same trace in Chrome), each with
bands for what must happen, taken from references rather than from the
plant:

| Aircraft | Scenarios |
| --- | --- |
| 5 inch | clip a gate at 15 and 30 m/s; full speed into a wall; prop strike on a hard landing; tumble down a slope; clip a branch; land upside down (turtle possible); lose one prop in flight |
| whoop | wall and floor bounces it survives (a whoop is built to), a gate clip at full speed |
| each plane | stall into the ground; nose in at speed; wingtip catch and cartwheel; belly landing too fast; tail strike on takeoff; hit a pole with a wing; into a tree canopy |
| floats | nose dig at speed (flips); a float catches in a turn (cartwheel); capsize in a crosswind gust; porpoise to a stall |
| Bramor | chute landing in wind, drag and rest; catapult launch into a stall |

Each scenario is judged on four things, in `scripts/crash-suite.js`:

- **Physics bands:** peak loads, what breaks and what does not, rest
  position and attitude, energy dissipated, time to rest, within bands
  derived from material limits and measured crash footage.
- **Determinism:** the Node and Chrome traces hash identically.
- **The picture:** a contact sheet of each scenario (before, impact, the
  parts, at rest) judged by the lead against reference crash footage
  stills, on a rubric like the photoreal loop's: 1 absurd, 5 plausible
  game crash, 9 indistinguishable from real footage.
- **The pilot:** the owner flies it. A crash that feels wrong is a
  failing scenario whatever its numbers say.

"Perfectly" is: every scenario inside its bands, every trace
deterministic, every sheet at 8 or above, no regression in any flight
without a crash (all existing gates and verify unchanged), the frame
budget held, and the owner has flown the suite's crashes and signed them
off. The loop stops only there, or when a wall needs the owner's
decision, which it reports instead of working round.

## Order of work

**Phase A, the foundation** (a parallel team, before the loop):

1. Parts and hulls: the part table per airframe from the drawn models,
   convex hulls, masses and joints, and a contact path that resolves
   parts instead of a box, bit identical until a damaging contact
   (docs/CRASH-STAGE1.md: every limit with its source).
2. Damage: joint and part limits, foam crush, prop chip and loss, the
   flight effects (thrust, vibration, control loss), and detached parts
   as bodies.
3. Surfaces: per material contact properties for the maps (the maps
   declare what each surface is), trees as catching obstacles, water's
   part (the floats' flagged failures).
4. The shell and the look: the wreck at rest, what the pilot sees,
   parts drawn as they break off, dust, grass, spray, splinters, the FPV
   feed failing when the camera or antenna does, sound, the reset flow,
   and the race rules.
5. The suite: `scripts/crash-suite.js` with every scenario, its bands
   and sources, its sheets, and a report the loop reads.

**Phase B, the loop:** each round runs the suite, scores every scenario,
picks the worst by what is most wrong (not what is easiest), fixes it as
a team with owned files, and merges only if no scenario gets worse, no
flight without a crash changes, and the budgets hold. The record is
appended below after every round. The owner flies a build every few
rounds; their verdict is part of the score.

**Alongside:** the moving water surface for the floats, now that the
photoreal loop has released the water code: the lake drawn from the
plant's own wave function (`sim_water_components`, on the sim clock), so
the waves the floats ride are the waves on screen; and the floats'
missing added mass, which makes their bob livelier than a real plane's.

## Rounds

(appended by the loop)

### Baseline (before the foundation)

Run 2026-09-25 on main at 50afb75 plus the suite (module dist/sim.wasm
sha256 afa65731...), `node scripts/crash-suite.js`: 60 scenarios, 4 inside
every band, 56 outside at least one; all 60 deterministic (the Node run,
its Node replay and the Chrome replay hash identically); no damage
readback in the module. Bands and their sources: docs/CRASH-REFERENCES.md,
which also lists what this plan got wrong (section 6: the whoop is the
five inch's plant in a scaled room; the tail strike applies only to the
three taildraggers, and not as a tail strike; the floats' gust capsize and
the Bramor's drag in wind need horizontal wind the air model does not
have; nothing can detach a prop).

Why they fail, by how many scenarios:

- **Nothing breaks (34).** Every must break band fails: the module has no
  parts and no damage. The 60 must not break bands pass only because
  nothing can break, and the report marks them vacuous.
- **Peak load (44).** Every contact is a one step impulse, so the CG sees
  its whole change of speed inside a millisecond: up to 2,000 g, several
  to tens of times what the references put for the same hit. The contact needs a duration, which
  is the damage model's crush and compliance.
- **Time to rest and rest distance (25 and 16).** The quad's gate, branch
  and wall hits roll on for seconds on the grass (the wall one slides down
  the face for 7 s); the quad on the slope sticks within 0.65 m where it
  should tumble 2 to 20 m; planes stop dead on a stall or nose in (0.05 s)
  or roll 7 to 14 m on their gear after a stall; float planes never come to rest.
- **Rest attitude and flips (18 and 11).** No plane cartwheels off a
  wingtip (the lowest the up axis gets is 0.77, still upright); stalls end
  upright instead of on the nose or back; the float planes' nose dig does
  not flip (minimum up 0.92 and 0.96) and the gust cannot capsize them.
  The Timber on floats does go over in the hard turn, the one flip today.
- **Trees (6).** Every plane bounces off the canopy to the ground; none is
  caught.
- **Floats' porpoise (2).** Held full back, both leave the water above the
  stall (1.6 and 1.25 times it) rather than prematurely.
- **The whoop against a wall (1).** It pins itself to the wall, nose down,
  and slides down it instead of bouncing off and flying on.

The four inside every band are the whoop's floor drop and gate clip, the
Slow Stick's taildragger take off and the Timber's fast landing on its
gear, all of which ask nothing to break.

What the loop should fix first, by what is most wrong: parts and damage
(34 scenarios cannot pass without them), then contact duration and crush
(44, and it is what makes the peak loads and the energy kept through a
hit physical), then the flips and cartwheels (a tip or a bow that digs in
must be able to throw the aircraft over), then trees that catch. Wind in
the air is an owner decision before two scenarios can be flown at all.

| Scenario | Result | Outside its band (measured, band) |
| --- | --- | --- |
| q5-gate-15 | fail | nothing broke (must break prop); peakG 1717 (50 to 300); timeToRestS 4.96 (1 to 4); retainedFirst 0.14 (0.3 to 0.7) |
| q5-gate-30 | fail | nothing broke (must break prop); peakG 889 (100 to 500); timeToRestS 1.73 (2 to 6) |
| q5-wall | fail | nothing broke (must break prop arm); timeToRestS 6.94 (0.5 to 2) |
| q5-prop-strike | fail | peakG 254 (10 to 50); timeToRestS 0.16 (0.2 to 1) |
| q5-slope | fail | nothing broke (must break prop); peakG 812 (20 to 150); restDistM 0.65 (2 to 20); retainedFirst 0.08 (0.25 to 0.5) |
| q5-branch | fail | nothing broke (must break prop); peakG 1453 (20 to 200); restDistM 17.82 (0 to 10); timeToRestS 3.55 (0.5 to 3) |
| q5-inverted | fail | peakG 726 (0 to 20) |
| q5-prop-loss | fail, stand in | nothing broke (must break prop) |
| whoop-wall | fail | retainedFirst 0.05 (0.2 to 0.7); flyingAtEnd False (true) |
| whoop-floor | pass | inside every band |
| whoop-gate | pass | inside every band |
| sky-stall | fail | peakG 429 (20 to 60); restAttitude upright (nose down or inverted); timeToRestS 0.05 (0.5 to 2) |
| sky-nose-in | fail | nothing broke (must break fuselage wing); peakG 1646 (100 to 400) |
| sky-cartwheel | fail | nothing broke (must break wing); peakG 248 (20 to 80); minUpZ 0.77 (at most -0.5); restAttitude upright (inverted or on its side); timeToRestS 0.64 (1 to 3) |
| sky-belly-fast | fail | peakG 53.79 (3 to 10); restDistM 7.41 (8 to 30); timeToRestS 0.77 (2 to 5) |
| sky-pole | fail | nothing broke (must break wing); peakG 1309 (20 to 100) |
| sky-tree | fail | nothing broke (must break prop); peakG 961 (5 to 30); restHeightM 0.12 (at least 2) |
| cub-stall | fail | nothing broke (must break prop); restAttitude upright (nose down or inverted); restDistM 6.82 (0 to 3); timeToRestS 3.87 (0.5 to 2) |
| cub-nose-in | fail | nothing broke (must break fuselage wing); peakG 1523 (100 to 400) |
| cub-cartwheel | fail | nothing broke (must break wing); minUpZ 0.77 (at most -0.5); restAttitude upright (inverted or on its side); timeToRestS 4.22 (1 to 3) |
| cub-belly-fast | fail | peakG 29.77 (3 to 10) |
| cub-tail-strike | fail | peakG 302 (0 to 10) |
| cub-pole | fail | nothing broke (must break wing); peakG 1197 (20 to 100) |
| cub-tree | fail | nothing broke (must break prop); peakG 964 (5 to 30); restHeightM 0.32 (at least 2) |
| radian-stall | fail | nothing broke (must break prop); peakG 407 (50 to 150); restAttitude upright (nose down or inverted); timeToRestS 0.06 (0.5 to 2) |
| radian-nose-in | fail | nothing broke (must break fuselage wing); peakG 1998 (100 to 400); retainedFirst -0.00 (0 to 0.05) |
| radian-cartwheel | fail | nothing broke (must break wing); peakG 158 (20 to 80); minUpZ 0.80 (at most -0.5); restAttitude upright (inverted or on its side); restDistM 2.33 (5 to 20); timeToRestS 0.53 (1 to 3) |
| radian-belly-fast | fail | peakG 19.83 (3 to 10); restDistM 2.22 (8 to 30); timeToRestS 0.41 (2 to 5) |
| radian-pole | fail | nothing broke (must break wing); peakG 1181 (20 to 100) |
| radian-tree | fail | nothing broke (must break prop); peakG 1424 (5 to 30); restHeightM 0.05 (at least 2) |
| slowstick-stall | fail | nothing broke (must break prop); peakG 30.39 (50 to 150); restAttitude upright (nose down or inverted); restDistM 7.81 (0 to 3); timeToRestS 4.06 (0.5 to 2) |
| slowstick-nose-in | fail | nothing broke (must break fuselage wing); retainedFirst 0.07 (0 to 0.05) |
| slowstick-cartwheel | fail | nothing broke (must break wing); minUpZ 0.80 (at most -0.5); restAttitude upright (inverted or on its side); restDistM 1.98 (5 to 20) |
| slowstick-belly-fast | fail | peakG 26.76 (3 to 10) |
| slowstick-tail-strike | pass | inside every band |
| slowstick-pole | fail | nothing broke (must break wing); peakG 540 (20 to 100) |
| slowstick-tree | fail | nothing broke (must break prop); peakG 426 (5 to 30); restHeightM 0.29 (at least 2) |
| timber-stall | fail | nothing broke (must break prop); peakG 40.19 (50 to 150); restAttitude upright (nose down or inverted); restDistM 14.12 (0 to 3); timeToRestS 5.57 (0.5 to 2) |
| timber-nose-in | fail | nothing broke (must break fuselage wing); peakG 843 (100 to 400) |
| timber-cartwheel | fail | nothing broke (must break wing); minUpZ 0.77 (at most -0.5); restAttitude upright (inverted or on its side); timeToRestS 4.51 (1 to 3) |
| timber-belly-fast | pass | inside every band |
| timber-tail-strike | fail | peakG 445 (0 to 10) |
| timber-pole | fail | nothing broke (must break wing); peakG 1584 (20 to 100); restDistM 6.66 (0 to 5); timeToRestS 3.16 (0.5 to 2) |
| timber-tree | fail | nothing broke (must break prop); peakG 1580 (5 to 30); restHeightM 0.30 (at least 2) |
| bramor-stall | fail | peakG 711 (20 to 60); restAttitude upright (nose down or inverted); timeToRestS 0.08 (0.5 to 2) |
| bramor-nose-in | fail | nothing broke (must break fuselage wing); peakG 1880 (100 to 400); retainedFirst -0.00 (0 to 0.05) |
| bramor-cartwheel | fail | nothing broke (must break wing); peakG 205 (20 to 80); minUpZ 0.77 (at most -0.5); restAttitude upright (inverted or on its side); timeToRestS 0.74 (1 to 3) |
| bramor-belly-fast | fail | peakG 44.99 (3 to 10); timeToRestS 0.79 (2 to 5) |
| bramor-pole | fail | nothing broke (must break wing); peakG 1373 (20 to 100) |
| bramor-tree | fail | nothing broke (must break prop); peakG 637 (5 to 30); restHeightM 0.45 (at least 2) |
| bramor-chute | fail, blocked | peakG 511 (10 to 40); restDistM 0.00 (5 to 100) |
| bramor-catapult-stall | fail | peakG 361 (20 to 80); restAttitude upright (nose down or inverted); restDistM 1.65 (5 to 30); timeToRestS 0.33 (0.5 to 2) |
| timberf-nose-dig | fail | peakG 44.29 (3 to 15); minUpZ 0.92 (at most -0.7); restAttitude upright (inverted); restDistM 41.34 (2 to 10); timeToRestS none (2 to 5) |
| timberf-float-catch | fail | peakG 397 (3 to 10); restDistM 10.16 (1 to 5); timeToRestS none (1 to 3) |
| timberf-capsize | fail, blocked | restAttitude upright (inverted or on its side); minUpZ 0.93 (at most 0) |
| timberf-porpoise | fail | liftoffOverStall 1.60 (at most 1) |
| cubf-nose-dig | fail | peakG 61.18 (3 to 15); minUpZ 0.96 (at most -0.7); restAttitude upright (inverted); restDistM 57.32 (2 to 10); timeToRestS none (2 to 5) |
| cubf-float-catch | fail | peakG 14.74 (3 to 10); minUpZ 0.40 (at most 0); restAttitude upright (inverted or on its side); restDistM 15.43 (1 to 5); timeToRestS none (1 to 3) |
| cubf-capsize | fail, blocked | restAttitude upright (inverted or on its side); minUpZ 0.93 (at most 0) |
| cubf-porpoise | fail | liftoffOverStall 1.25 (at most 1) |

### Lead decisions after the baseline (2026-09-25)

- The whoop is the five inch plant flown in a room built at MICRO_SCALE
  (3.43): it gets its own part table whose limits let it survive what a
  real 65 mm whoop survives, rather than a five inch's.
- Tail strike on takeoff fits no aircraft here (the wheeled planes are
  taildraggers, the rest are thrown or catapulted); the suite replaces
  it with a nose over, the taildragger's takeoff accident.
- Horizontal wind is added to the air model in the loop's first round,
  deterministic and zero by default so every flight without it stays
  bit identical; it unblocks the float capsize and the Bramor's chute
  drag, and later the Timber's short landings and the floats'
  weathervaning.
