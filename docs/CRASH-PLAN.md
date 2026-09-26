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

### Phase A progress and decisions (2026-09-25)

The suite (#46) and the core (#48) are merged; the shell and look agent
is building against the core's readback ABI; the moving water (#47) is
being rebased onto the core.

Decision on contact duration: the core could give only damaging
contacts a duration, because giving every contact one would change every
existing gate. The rule is refined: **with damage OFF every flight is
byte identical to before the crash work** (proved by
scripts/crash-identity.js across 24 scripts); **with damage ON, every
contact may have its physical duration and crush**, because that is
what makes loads real, and damage on gets its own expectations in the
crash suite rather than borrowing the rigid hull's. The two rigid hull
self tests keep running with damage off, as they do now.

Decision on the floats' stopped prop tips dipping into a swell with
damage on: kept, it is a real contact.

### Round 1 (started 2026-09-25)

Baseline on main a86859f, after the shell (#49): 60 scenarios, 4 inside
every band, 56 outside at least one, 60 deterministic, damage readback
not wired. Damage off is byte identical across scripts/crash-identity.js.

Team, with owned files:

- suite: scripts/crash-suite.js, tests/crash/**, docs/CRASH-REFERENCES.md.
  Wire the readback to the core ABI with damage on, replace the tail
  strike with a nose over, keep the wind scenarios blocked until wind
  lands.
- core: src/native/**, dist/sim.wasm. The silent prop chip, material
  hardness only through events, water and tree entry readback, horizontal
  wind (zero by default, bit identical without it), float bow suction and
  added mass.

Round 2's targets are picked from the suite's failure histogram once the
readback is wired.

Round 1, suite (#50, merged): every scenario runs with damage on and
reads back what broke; the tail strike is replaced by a nose over
(R-NOSEOVER). Tally unchanged at 4 of 60, but every failure is now
measured. Most frequent failing metrics: peakG 37, timeToRestS 32,
restAttitude 20, mustBreak 18, restDistM 15. What the readback shows:
a power off stall from 8 m shatters every plane at 370 to 720 g and
stops it dead in 0.03 to 0.06 s; the fuselage is the root part, so
`mustBreak fuselage` cannot pass; quad props chip but never break (the
gate clip peaks at 1717 g); no taildragger noses over, because the
wheels roll at 0.08 on every surface with no brake; floats come apart
porpoising; the energy tally counts only crush.

Round 1, core (#51, merged): a blade chips only past glass filled
nylon's strength, so no damage without an event (8 silent scenarios to
0); water and tree entry events (8, 9); horizontal wind
`sim_set_wind(vx, vy, gust)`, still air bit identical; float bow
suction and implicit added mass (Timber 3.47 kg, Cub 2.53 kg, heave 0.29
to 0.49 s), damage on only. Suite after: 4 of 60, failing checks 159 to
151, all deterministic, verify 16 of 16, damage off identical on 24
scripts.

Lead decisions: added mass and suction stay damage on only for now,
because turning them on for every flight re-records floats:gates; the
Cub's F5c water landing reads 0.59 of the derived distance with damage
on against a band starting at 0.6, caused by the added mass, and the band
is not moved. wing:e2e's exit 1 in worktrees is a missing
../fdfpv-leaderboard (passes with FDFPV_BOARD set); score:selftest's
"Maverick Loop" failure predates the crash work and stays loud.

### Round 2 (started 2026-09-25)

Targets, worst first: stalls shatter every plane at 370 to 720 g and stop
it in 0.05 s (peakG, timeToRestS, restAttitude are the three most
failed metrics); the fuselage can never break; the energy tally counts
only crush; quad props never break; no taildragger noses over; a canopy
cannot drag the Bramor over the ground.

- impact: crash.c, crash_parts.h. Foam and airframe crush that spreads
  a plane's impact over a real duration, the root part's break rule,
  energy from breaks, blade breaks on quads and the whoop's scaled limit.
- ground: the wheel and ground code in plant.c and plant_wing.c, plus
  the Bramor chute metric in the suite. Rolling resistance by surface, a
  wheel brake in the ABI, canopy drag over the ground.

Round 2, impact (branch crash-impact-round2), against main da32758 (5
of 60, 146 failing checks): 6 of 60, 145 failing, 60 deterministic
(Node, replay and Chrome). With damage on, a stiff part's ground contact
is the spring the judge always assumed (part and surface in series)
instead of a one step impulse: stall peaks 380 to 168 g (Skyhunter), 716
to 250 (Timber), 532 to 261 (Cub), 373 to 205 (Radian), 475 to 129
(Bramor); nose ins 1877 to 440 (Bramor), 561 to 354 (Slow Stick, now in
band). The whoop's spinning blades are met as life size polycarbonate;
the parts' energy tally counts breaks and bends. One passing check
moved: q5-gate-15 loses its pack strap at a 16.6 m/s ground impact 4.9 s
after the gate, which the rigid contact survived at 1717 g. Damage off
is byte identical on all 24 identity scripts.

What round 2 found and left for round 3, in the impact agent's files:

- The stalls still break wings and packs, at 30 to 60 g of normal load.
  Three causes, each needing a decision or data rather than a tuned
  number: the plant arrives flat (16 deg nose down on a 36 deg path),
  not nose low as the references assume; grass friction is the shell's
  1.40 for every part, so a foam belly is stopped dead sideways and the
  judge adds that deceleration to every joint (no foam on grass source
  found; R-SLIDE assumes 0.3 to 0.6); and the joints are judged
  quasi statically as rigid bodies, while a foam wing's first bending
  period is long against a 20 ms blow, and a pack in a bay bears on its
  walls rather than its strap.
- The root cannot break except by crushing through, and in 5 of 6 nose
  ins it does not: the pack and motor break loose in the first
  millisecond and fly through the fuselage as free bodies instead of
  loading the nose, and the root alone (the Cub's 0.5 kg at 23 m/s, 132
  J) is just under its crush capacity (136 J). A nose part with a
  section strength, or parts contained by their bay, needs EPO section
  data that R-FOAM does not have.
- Quad props still only chip on gate, slope and branch: a spinning
  blade striking a pole is judged by the craft's closing speed, not by
  its own tip's blow; the gate clip's peak is the host's one impulse
  per call and cannot get a duration from the plant side alone.
- Parts softer than the ground (blades, whips, wing tips, wire gear)
  keep the rigid contact: letting them bend until the airframe behind
  meets the ground needs each one's travel (tried: routing their load to
  the stiffer parent moved turtle mode and cartwheels the wrong way).
  The Bramor under its canopy lands on its winglets and antenna, so it
  still peaks at 303 g (ground agent's finding).
- The whoop keeps the rigid contact: its room is scaled 3.43 times, its
  surfaces' stiffness is not, and scaling it moves the limits round 1
  calibrated the whoop on.
- The ground agent's lower grip on the part hulls with damage on (0.76
  where 1.40 is expected) is not confirmed or explained yet.

Round 2 closed (lead, 2026-09-25): ground #52 and impact #54 merged.
Suite on main 8f47f5b after a fresh wasm build: 6 of 60 inside every
band (from 4), all 60 deterministic; verify 16 of 16; damage off
identical on 24 scripts. Stall peaks fell by half or more (Timber 716 to
250 g, Bramor 475 to 129 g) but stay outside their bands.

Lead decision on the one regression: q5-gate-15 now loses its pack, not
at the gate but in a 16.6 m/s ground impact 4.9 s later that the rigid
contact survived at 1717 g. The spring contact is the more physical of
the two, so it is kept; what is wrong is the scenario, whose reference
tumbles to the grass a few metres on, not flying on for 5 s into a 60
km/h impact. Round 3's suite work reproduces the reference's
trajectory, and the regression stays on the record until then. Also
accepted: two round 1 core cases that asserted damage on and off give
identical grass landings now assert no damage, a softer blow and the
same rest within 1 mm, under the round 2 rule.

### Round 3, core (branch crash-core-round3)

Against main 613cd0c (the suite's round 3 merged; its Node run: 7 of 60,
142 failing checks), the core's four commits give 8 of 60 inside every
band and 129 failing checks, all 60 deterministic (Node, replay and
Chrome); damage off identical on all 24 identity scripts (wing:e2e with
FDFPV_BOARD). Most failed metrics before and after: peakG 39 to 36,
timeToRestS 29 to 18.

- **Stalls (item 1).** Three changes, each sourced. A part that meets
  grass flat on a face slides at a sled's 0.45 (Linthorne and Cooper
  2013), an edge or a tip keeps the shell's 1.40, and the resting slide
  counts the ground's grip once. A wing panel on a carbon spar, and the
  Skyhunter's carbon booms, ring through their first bending mode (E I
  from the tables' own spar limits and pultruded carbon's 127 GPa, 8 to
  13 Hz) instead of being judged as rigid bodies. Every part meets the
  ground through its own spring over its travel (below). Stall peaks,
  g: Skyhunter 168 to 201, Cub 261 to 98, Radian 205 to 160, Timber 250
  to 96, Bramor 129 to 89, the Bramor's catapult stall 132 to 57. The
  Cub's and the Timber's wings now stay on; the Timber's stall is inside
  every band but its rest attitude. The Skyhunter's peak is its pusher's
  prop touching down behind the boom in one step, and its tail's
  stabiliser still breaks; the Cub's and the Radian's foam tail booms,
  which have no carbon section in the tables, still break in their
  stalls (see round 4).
- **Fuselage break (item 2): built, measured, not shipped.** A nose part
  ahead of the battery bay's rear wall, carrying the pack, the camera and
  a tractor's motor, on a joint of the bay's section (a U channel with
  its hatch open, 6 mm walls, EPP's tensile strength at 30 g/L, 0.38 to
  0.45 MPa: JSP ARPRO 55.5 psi, BASF Neopolen P 0.30 to 0.74 MPa at 20 to
  50 g/L). It broke the nose off in all four foam nose ins (Skyhunter,
  Cub, Radian, Timber), but also in seven scenarios that must not break
  the fuselage (belly landing, cartwheels, poles) and in both floats' nose
  digs, which then stopped flipping: 131 to 142 failing checks. The
  section is judged quasi statically like the wings were, and a belly
  contact is two or four box corners, so the nose with the pack in it is
  cantilevered off one corner; the section needs its own ring (EPO's
  modulus is not in any datasheet found) or a distributed belly contact.
  Two of the four nose ins (Skyhunter, Radian) now break the fuselage
  anyway, by crushing through, with the wings kept on longer.
- **Quad props (item 3).** A spinning blade that strikes something hard
  enough to stop its tip (the existing impedance limit) is stopped by its
  own spring, v_tip sqrt(k m_blade / 3), and that blow at its root can
  shear it off in the strike. Both taildraggers' nose overs on sand now
  shed the prop, and the Cub's rests on its nose. The five inch's gate
  clip does not: its props turn at about 7,300 rpm at the strike, a 48 m/s
  tip under the 71 m/s a pvc gate asks of glass nylon. The gate clip's
  one impulse per host call is unchanged.
- **Soft parts (item 4).** Every part's travel is how far it stands out
  past the stiffer parts along the contact; it springs (its own and the
  ground's in series) until that runs out, then the stiffer part adds its
  spring at its own point and carries its share through its own joint.
  Concrete is no longer rigid for every part. Wire (whips, gear legs)
  keeps the rigid contact: sprung, even capped at its yield, it broke the
  taildraggers' wings on the nose over and the five inch's whip and pack
  on its back. The Bramor under its canopy peaks at 136 g where it read
  303 (bramor-chute, band 10 to 40), and comes to rest on its fuselage,
  the winglets' magnets letting go under it (bramor:gates B12 fails with
  the mode on, passes off).
- **Grip (item 5).** Not reproduced: the grip on the part hulls at main
  reads 1.39 (Skyhunter) and 1.16 (five inch) with damage on, and the
  crush does not cap the normal force. What measuring it found is the
  double count above (0.88 g on a 0.45 face), fixed.

Regressions against main, per scenario per metric, each with its cause:

- cub-cartwheel peakG 54 to 473 g and restDistM 10.2 to 4.5 m: the new
  trajectory lands on a wire gear leg, whose contact is still the rigid
  one step impulse (4.6 N s).
- radian-cartwheel and slowstick-cartwheel mustBreak wing: the Radian's
  panel now rings through the tip strike and stays on; the Slow Stick's
  one piece wing no longer comes off the belly flop that follows, which
  was the quasi static break the stalls had.
- timber-nose-in mustBreak fuselage and retainedFirst 0.035 to 0.179: with
  the wings ringing the root no longer crushes through, and the wreck
  slides on at the face grip.
- timber-cartwheel peakG 76 to 264 g and restDistM 10.4 to 2.2 m: it now
  cartwheels (minUpZ 0.77 to -0.53, the wing breaks, both into their
  bands) and the peak is the tumble's.
- timber-pole restDistM, timeToRestS, retainedFirst: after the pole it
  slides at the lawn's 0.45 where 1.40 stopped it.
- bramor-stall restDistM 0.3 to 5.4 m and bramor-belly-fast 9 to 44 m:
  the composite belly slides at 0.45; from 26 m/s even R-SLIDE's upper
  0.6 gives 57 m, so bramor-belly-fast's band (8 to 30 m, derived for
  10 m/s) is the suite's to revisit.
- cubf-capsize restAttitude: it still capsizes (minUpZ -1.00), and the
  wreck comes to rest upright again on the water.

Checks: crash:core 146 of 147; the one failing is round 2's "a five inch
dropped flat from 1.5 m rests within 2 mm of the rigid contact": 2.72 mm,
the landing's lateral kick sliding on at the lawn's grip counted once
where the rigid contact's doubled grip stopped it dead. Left loud for
the lead: the threshold was not widened.

Left for round 4, in the core's files: foam booms and fuselage sections
need a sourced EPO modulus to ring like the spars (the Cub's and the
Radian's stall tail breaks, and the nose part above); wire parts need a
model of folding; the pusher's prop touching down behind the boom is
still a one step contact in the Skyhunter's stall; the Bramor's
composite panels have no spar section in the tables; the gate clip's one
impulse per host call.

Round 3 closed (lead, 2026-09-25): suite #55 and core #56 merged. Suite
on main a6d41c9 after a fresh wasm build: 8 of 60 inside every band
(from 6), failing checks 142 to 129, all 60 deterministic; verify 16 of
16; damage off identical on 24 scripts.

Lead decision on the merge rule: #56 made 14 per scenario metrics worse
against 13 fewer failing checks overall. Most of them are rigid body
artifacts going away (cartwheel wing breaks that were never physical)
or the new sourced grass grip letting wrecks slide on. They are kept,
and each is a round 4 target rather than a reason to hold the round:
cub-cartwheel 54 to 473 g on a rigid wire gear leg, timber-nose-in no
longer crushing through the root, the Skyhunter's pusher prop touching
down in one step, bramor-belly-fast's 8 to 30 m band derived for 10 m/s
from a 26 m/s entry. crash:core stays at 146 of 147: the round 2 check
that a five inch dropped flat rests within 2 mm of the rigid contact
reads 2.72 mm, because the grip it assumed changed by design. Its
threshold is not moved; round 4 replaces its premise with a reference
or the failure stays loud.

### Round 4 targets

- Core: a sourced EPO modulus so foam booms and fuselage sections ring
  like the spars (the Cub and Radian tail booms, and a workable nose
  part); wire gear that folds; the pusher prop's one step contact; the
  gate clip's single impulse per host call.
- Aero, a new owner of plant_wing.c's stall: every plane settles into a
  steady stalled descent with the nose 18 to 33 degrees above its path
  and the wings level to 0.01 degree; only the Slow Stick has a post
  stall nose down moment, and roll damping is constant through the
  stall, so no wing drops and no spin starts.
- Suite: bramor-belly-fast's band for its real entry speed; the crash:core
  2 mm premise; the quad's grass rebound against R-A4-REBOUND.

Round 4, core (#60, merged by the lead, 2026-09-25): foam booms ring
(sourced bead foam modulus), wire gear folds (ASTM A228), the 2 mm drop
check's premise replaced by the sourced grass grip's stopping distance
(crash:core 148 of 148). Suite 9 of 60 in every band, failing checks
130 to 134. Lead decision: the regressions are the Cub and Timber stalls
now landing flat on folding legs and rolling on, where on main they
passed only because rigid legs snapped and dropped the nose onto the
prop; the fault is the stall entry, which the aero PR (#59, sent back
for sourced severity and an unchanged ground roll) owns. The Skyhunter
pusher item dissolved with the ringing booms; the gate clip's duration
needs a host change and stays open.

### Round 4, aero (branch crash-aero-round4, #59)

The model and its record are docs/STALL-STAGE1.md; four returns from the
lead and one from the owner's flight shaped it. As it stands:

- Past the stall angle the lift is the section's measured curve (UIUC
  low speed data at each kit's Reynolds number): the peak the plant's own
  curve reaches, held for stall_top, then a fall to stall_k of it, then
  Viterna and Corrigan to the plate. Short of the stall angle it is the
  plant's own curve, which every band was derived on.
- The wing is four spanwise strips a side, loaded by Schrenk's
  approximation, each strip's lift its own wing lift; its stall follows the
  steady one with Leishman and Beddoes' separation time constant.
- The pitch break moves the stalled wing's force aft as its lift falls,
  with the tail's downwash term.
- A washout per airframe, FITTED (not sourced) to its reviewed stall
  behaviour: Cub 3, Skyhunter 5, Timber 2, Slow Stick 2, Bombshell 3 deg.
- Nothing is taken short of the stall angle or below a chord Reynolds
  number of 3e4 (Lissaman 1983).

The owner flew the Cub (b69e0df) and signed the stall off ("works"); the
stored hashes of the recordings that cross the stall (C22, G20, B13, S17,
T14, F9, the Bombshell's S17) were re-recorded on that sign-off, one
commit each. The Bombshell's S9a mush band was re-derived on the new model
(1.98 m/s derived, 1.91 flown). B1 now starts at the Bramor's published
cruise instead of under its stall. stab:glide and stab:chop hold
unchanged (the glides are short of the stall).

Open, each failing or unmet on purpose, the reason in docs/STALL-STAGE1.md:

- Slow Stick S9b, full up held under power: bank 28.7 and yaw 44.5 against
  15 and 20. A torque turn that tightens as the inner wing sinks into its
  stall; no source describes a Slow Stick held full up under power.
- The Bombshell's take off heading (bombshell:stab): 6.6 deg and 0.80 m
  against 5 and 0.5; 4.9 and 0.50 on main. Its three point roll sits past
  the stall, where the section's lift now holds; washout does not move it.
- The Timber held full back in Manual wanders into 50 deg of bank in 10 s;
  no washout up to 5 deg brings it under 30.
- The Radian drops 72 deg against a review of "extremely gentle"; no fit
  within a few degrees, and its section, twist and tips are unpublished.
- The Bramor, untwisted by decision, tip stalls into a flat spin its
  elevons do not recover; the chute does, at its rated sink, from 17 to
  197 m (scripts/bramor-spin-chute.js).
- The Cub and Timber stall ins mush onto their gear and roll on, where the
  bands expect a nose low hit: the kits' reviews and the full scale
  references behind the bands disagree.

### Round 5 (started 2026-09-25)

Main 4a9a30b: 8 of 60 in every band, 147 failing checks (the wing clip
fix #67 took the struck panel only, and showed the pole bands' premise
is against the part limits). The owner judged the loop too slow, so this
round is five agents at once, each with owned files, merged as each goes
green: hull (collide.js, a plane shaped collision hull), ground impact
(crash.c: a duration for every stiff contact, host obstacles resolved
over the contact, grass), suite (tests/crash: re-derive the pole,
stall-in and belly bands whose premise the physics has disproved, and
source the LOW bands), aero (plant_wing.c: Radian, Timber drift, Slow
Stick S9b, the Bombshell's take off heading), parts (crash_parts.h:
Bramor composite sections, balsa and EPO data).

### The finish line, changed by the owner (2026-09-25)

Asked how long "perfectly" would take (estimated 4 to 6 more rounds,
one to two days, plus the contact sheet rounds), the owner set the
finish line for now to FEELS RIGHT: the crashes a pilot meets (a
wingtip clip, a cartwheel, a stall into the ground, a nose over, a
float nose dig and flip, a quad clipping a gate, a quad into a wall)
look and feel right when flown, judged by the owner's flights and by
headless real shell checks the lead runs on each. The suite's bands
stay as the measure and keep improving in the background, but they no
longer block the loop's end. Round 5 finishes as planned; then one
feel round on the owner's list above, then the owner's sign off.

Round 5 closed (lead, 2026-09-25): hull #68, suite bands #69, parts #70,
aero #71 and #72 (Radian washout 6 deg FITTED, past the 5 deg bound by
lead decision), ground impact #73, and the suite counting the plant's
own obstacle contacts (875c186). Suite on main: 10 of 60 in every band,
115 of 294 checks failing (147 of 303 at the round's start), all 60
deterministic. Open, recorded: Timber drift held full back in Manual,
Slow Stick S9b, the Bombshell's take off heading, q5-wall at about 2300
g (a frame crush value), quads stopping dead on grass (a depth
dependent grass grip), the Bramor's flat spin, and a gyroscopic
instability in plant.c when a whoop loses its pack (the tumble runs
away and hung crash.c's free body loop; #73 kept the whoop on host
contacts to avoid it).

The gyroscopic instability, fixed (branch fix/damaged-gyro-integration):
the cause was the explicit step itself, not a reduced inertia (the pack
out airframe keeps about 95% of its inertia, and the explicit step pumps
a torque free tumble at the intact inertia too); with the pack gone
nothing powered takes the energy back out. A damaged airframe
(CRASH.active) now steps its rates with an axis split of the free rigid
body that holds |L|, and a rate guard stops any body past 10,000 rad/s
before a halving loop can hang (sim_rate_guard_trips counts it). Intact
flight is bit identical. The whoop then goes on the plant's obstacle
contacts like every other craft: in whoop-gate it now loses its pack at
the gate, the case that ran away, and peaks at 186 rad/s. Suite on that
branch: 9 of 60 in every band, 115 of 294 checks failing (main 10 and
115); whoop-wall no longer breaks its prop and pack (mustNotBreak into
band), whoop-gate's peak falls to 230 g (band 300 to 1,500) and it rests
in 2.01 s (band 0 to 2), the spring contact's softer blow as the five
inch's gate clip had in #73.

Next: the feel round, then the owner's sign off.

### 2026-09-26: the push to the finish

Merged since round 5: the feel round (#75), joint sanity (#77), shell
feel fixes (#78), roofs everywhere (#76) and the solid handoff that
stops a craft passing any wall the host knows (#79), cartwheel, nose
over and reset fixes (#80), float bow planing and the restaged nose
digs (#81), the quad keeping its pack at a gate (#82), grass grip with
a turf plough (#83), a lost prop's windage (#85), compliant PVC gate
posts (#87), tyre side force by slip angle (#88). crash:core 234 of
234. The owner approved on 2026-09-26 the pending decisions, including
#84 (stability to body axes for the lateral derivatives, every recorded
flight re-recorded) going in without a flight first. Open: #86
(cartwheels must still go over; the ground projection's speed kill),
then the final feel re-run and the owner's sign off.

### Feels right reached (lead, 2026-09-26)

Merged after the push: #84 (stability to body axes, approved by the
owner), #86 (ringing damping, growing foam patch, no projection speed
kill), #89 (a bending panel returns its energy through its own spring;
the craft is never lifted out of the ground). crash:core 234 of 234.
The lead's feel run on ca3e831 and the #89 sheets: the Cub pole and
corner clips, the Skyhunter and Timber cartwheels, the mush stalls, the
Timber nose over, the float nose dig, the quad gate clips at 15 and 30
m/s and the wall, and the Bombshell into grass and onto a roof all read
right. The suite's bands (7 of 60 in every band, 119 failing checks)
keep improving in the background and no longer block the loop. What
remains is the owner's sign off, flown after the reboot the broken
NVIDIA driver needs.
