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
