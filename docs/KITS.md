# Visual part kits and lights: the contract (Need for Speed level customization, step 2)

Owner, 2026-10-07: customization at Need for Speed level. This lane is the
VISUAL part kits per aircraft family, plus LEDs and lights. Written before
the code; each PR that builds a piece cites its section. Status: CONTRACT.

## 1. What exists already (checked against origin/main 33c57145)

- The livery entry (configs/liveries.js `normaliseEntry`, keyed by
  `liveryKey`, so a float variant shares its plane's entry): scheme,
  regions, under, finishes, decals, wear; `patterns` arriving in #737.
  It already travels everywhere a kit must travel:
  - account sync: section `livery`, `keyed` (src/share/progressmerge.js);
  - builds: `fit.livery` (src/ui/builds.js);
  - saved liveries: `liverySaves`;
  - livery codes: configs/paint.js `encodeLivery` / `decodeLivery`;
  - rooms: src/render/peers.js keys its model cache on `profile.livery`
    and dresses peers with `lookFor(normaliseEntry(...))`.
- Builders take `opts` (src/render/craft.js `buildCraft`), register
  coloured materials with `paint.base(region, mat)` and are dressed by
  `dressParts(dressLivery(built))`.
- The parts lane (docs/PARTS-WEAR.md) owns FUNCTIONAL parts: props and
  add-ons with grams and drag (configs/hangar-parts.js), wear on
  `settings.parts[id]`, the bench with stat previews and the exploded view.
- The Shop (docs/ECONOMY.md, src/game/economy.js `ITEMS`): token prices,
  earned items by feat, server is truth.
- src/render/quality.js: graphics `low`, `medium`, `high`.
- src/render/post.js has a small tight bloom on the cel worlds, so an
  emissive LED reads as a glow there without a real light.

## 2. What the player sees

A **Kit** page in the hangar workshop, beside Paint. A row of slots for
this family; each slot a row of options drawn on the 3D model as they are
pointed at (preview), fitted on press, saved at once. Locked options show
a lock and either a token price (Shop) or the feat that earns them.
A **Lights** page: LED colour and pattern for a quad, nav lights and
strobes for a plane, underglow where it fits. The hangar dims its lamps
while the Lights page is open so the lights read. Other pilots in a room
see the kit and the lights.

## 3. Catalogue per family (first pass; every item cosmetic only)

"Inside" means the drawn part stays inside the stock part's box
(configs/hulls.js), see section 5. `kits:quads` and `kits:planes` hold
each option to the whole stock model's box plus 1 cm, and to drawing
differently from stock; each plane has its own slot list, a slot only
where the airframe has the part.

| Family (airframes) | Slots and options |
| --- | --- |
| Skyhunter (sky1800) | spinner: stock, bullet (on the pusher, pointing aft); wingtips: stock, winglet. A twin boom pusher with no wheels and no cabin glass |
| Cub (cub1400, and cub1400f on floats) | spinner: stock, bullet, flat cap; wheels: stock, tundra (the same diameter on a fat balloon, so it sits where it did). On floats the wheels slot draws nothing |
| Kadet (kadet1981) | spinner: stock, bullet, flat cap; wheels: stock, pants (on the mains, the spinner's red); canopy tint: clear, smoke, gold (the windows; glass is not a paint region) |
| Slow Stick (slowstick1180) | spinner: stock nut, bullet; wheels: stock, tundra |
| Ugly Stik (uglystik1567) | spinner: stock nut, bullet (the fuselage's red); wheels: stock, pants |
| Timber (timber1500, and timber1500f on floats) | spinner: stock, bullet, flat cap; canopy tint: clear, smoke, gold. It stands on tundra tyres already, so no wheels slot |
| P-51D (p51d1450) | spinner: stock, two tone (black front), striped (yellow ring); exhausts: stock, flame dampers (one shroud a side in place of the six stacks); wheels: stock, covered; canopy tint: clear, smoke |
| Tiger Moth (tigermoth1803) | spinner: stock, two tone (polished front), striped (yellow ring); exhausts: stock long pipe, short stacks; wheels: stock, covered (the fuselage's colour). Open cockpits, so no canopy |
| Bombshell (bombshell1118) | spinner: stock Cox nut, bullet; wheels: stock, covered (the wing's red); canopy tint: clear, smoke |
| Jet (f16878) | nose: stock, grey radome; fin cap: stock, drag chute fairing; exhaust: stock, burnt titanium (straw collar, blued petals). The canopy is a paint region and gold already, so no tint slot |
| Radian (radian2000) | nose: stock, long pointed spinner (in the stock spinner's length); wingtips: stock, winglet. The canopy is a paint region, so no tint slot |
| NRJ (nrj1490) | nose: stock, long pointed cone. A throw glider: no canopy, no tips a winglet belongs on |
| Zagi (zagi1219) | winglets: stock, raked, split (both keep the stock root, height and aftmost corner: a taller one would grow the box); nose: stock, camera bubble |
| Bramor (bramor2300) | winglets: stock, raked, split. Its nose is the gimbal ball, the box's front, so no bubble |
| Combat quads (7inch, 10inch, interceptor) | arms: stock, cut out, X blade, tapered; top plate: stock, vented, armoured cap; camera mount: stock, TPU cage, side plates; antenna: stock whip, dual T, pagoda (drawn only). Prop colour is the existing `props` paint region. The interceptor has no mount slot (its camera is in the armoured nose) |
| Striker (striker2500) | nose: stock, sensor dome (under the nose cap, above the skid's foot); fins: stock, swept (the stock root and height, the tip pulled back) |

Routed to the parts lane, NOT here: prop blade count and diameter (a
different prop is thrust and mass; hangar-parts.js `PROPS` already sells
them), anything with grams or drag (pods, extra cameras, real fairings
that change drag). Prop COLOUR is here.

## 4. Lights

| Light | Who | Patterns | Driven by |
| --- | --- | --- | --- |
| Arm LEDs (one per arm, under the motor) | quads | solid, chase, strobe, throttle, battery | colour = palette; patterns read the craft's own pose |
| Nav lights (left red, right green, tail white) | planes | steady | always |
| Strobes (white, wingtips) | planes | double flash | the flight clock |
| Beacon (red, belly) | planes with a fuselage | rotating pulse | the flight clock |
| Underglow | quads, F-16 belly | solid, breathe | the flight clock |

- Every pattern reads the **flight clock** (sim step count, the replay's
  own clock), never wall time, so a replay and a peer flash in step.
- `throttle` reads the pose's throttle and `battery` the pack voltage the
  HUD already shows. Peers: throttle is in the room pose; battery is not,
  so a peer's `battery` pattern shows as solid. Stated in the picker.
- The lights are visible at night maps and the Interior's dusk because they
  are emissive (unlit by the scene), bloom picks them up on the cel worlds.

### Light cost budget (by quality id)

| Graphics | Own craft | Each peer |
| --- | --- | --- |
| low | emissive meshes only, 0 real lights | emissive only |
| medium | emissive + 1 real point light (underglow / landing light), no shadow | emissive only |
| high | emissive + up to 2 real point lights, no shadow | emissive only, 0 real lights |

Emissive meshes are a few dozen triangles and share one material per
colour; patterns change the material's `emissiveIntensity`, no new
material per frame, no allocation per frame. The real light count is
FIXED per quality id for the whole session (three.js recompiles every
shader when the light count changes), so a light that is off has
intensity 0, it is not removed.

Perf test (`kits:perf`, browser, run through `~/.cache/run-check-slot.sh`
on a quiet GPU, `nvidia-smi pmon -c 1` recorded first): a 4-pilot room on
a night map with every pilot's lights on, against all lights off, GPU
frame time median. Budget: +0.3 ms on high, +0.1 ms on low. The number
and the pmon output go in each lights PR body.

## 5. The physics-zero guarantee

A kit is pixels. It never reaches the plant, the referee or the journal:

1. configs/kits.js and src/render/kit*.js are imported by the render and
   UI only. The check walks the import graph of src/sim, src/game,
   src/native glue and src/replay and fails if any reaches them.
2. The seat blocks (`sim_set_power`, `sim_set_motors`, `sim_set_prop_pack`,
   parts) for every airframe are built with each kit fitted and compared
   with stock, double for double.
3. A recorded flight per family replays through src/game/teststand.js with
   every kit and light fitted; the state trace hash equals stock.
4. Mid-air: the referee meets configs/hulls.js, generated from stock
   builds (scripts/hulls-gen.js builds with no livery source). A kit part
   must stay inside its stock part's box; `kits:selftest` builds each
   option and checks its bounding box against the stock part's box plus
   1 cm. A wingtip or wheel pant that would grow the box is redrawn
   smaller, never fitted to the hulls.
5. `crash:core`, `war:legacy` and `render:golden` (stock) unchanged.

## 6. Data shape (stored player data, versioned)

Two optional keys on the livery entry, so every carrier in section 1 takes
them with no new section:

```
entry.kit = { v: 1, parts: { [slot]: optionId } }        // a slot left out is stock
entry.lights = { v: 1, led: '#rrggbb', pattern: 'solid'|'chase'|'strobe'|'throttle'|'battery',
                 nav: true|false, strobe: true|false, glow: '#rrggbb'|null }
```

- Ids are checked against configs/kits.js for the family; an unknown slot
  or option is dropped and counted (`entryDrops`), so a shared code from a
  newer build is refused with the existing "unknown field" sentence.
- Migration: `v` absent or no key = stock, no lights. `v` greater than this
  build knows is kept untouched on the account (keyed merge passes it
  through) and drawn stock. A check seeds an old settings blob, an old
  account blob and a v1 code and reads them back.
- Livery codes: `decodeLivery`'s whitelist gains `kit` and `lights`; the
  code's `v` stays 1 since an older reader refuses unknown keys already
  (agreed with the livery lane through the plan file, which owns the code
  version).
- Server: tracks-api imports progressmerge; the livery section has no
  ENTRY_SHAPE, so the server keeps the keys as sent. Shop and earned kit
  items need `ITEMS` on the server: that PR says "needs a VM deploy".

## 7. Earn and shop

Lead decision 2026-10-08: per family two options sold, one earned, the
rest free; lights are free and off by default. `ITEMS`
(src/game/economy.js) carries `kind: 'kit'` items, ids
`kit:<family>:<slot>:<option>`, read off the catalogue: the last option
of the first two slots is sold, the last option of the third slot (the
second when a family has two) is earned by an hour flown on that
aircraft (`hour:<airframe>`, from the synced flight time). Price: 70
tokens each, because ECONOMY.md's rule "flying everything once buys the
whole shop" must hold: 1,400 (paint) + 33 x 70 = 3,710 against a ceiling
of 4,050 (economy-selftest holds it). Prices are the owner's to change.

In the Kit tab a sold or earned option not owned shows its price or
"Earned only", is tried on when pointed at, and when pressed opens in the
Shop, chosen, instead of fitting. The Shop lists the paint items and this
aircraft's kit items. Codes and saves are not checked against ownership
(the same lead decision as shop finishes). Buying needs the server's
ITEMS: a VM deploy.

## 8. PRs, in order

1. This contract.
2. Data + sync: configs/kits.js (catalogue, `normaliseKit`), the entry keys,
   code whitelist, `kits:selftest` (migration seeds, physics-zero 1 and 2).
3. First family's models: combat quads (arms, top plate, camera mount,
   antenna) through builder `opts.kit`, registered with
   `paint.base` so colour, finish and decals still apply.
4. The Kit page in the hangar (real pointer browser check, pictures).
5. LEDs and nav lights + `kits:perf`.
6. Remaining families, one PR each group.
7. Rooms display check (two pages, a peer's kit and lights).
8. Shop and earn hooks (needs a VM deploy).

## 9. What this does NOT do

No mass, drag, thrust or hull change of any kind; no new crash parts; no
real money; no edits to the parts lane's `settings.parts`, the bench or
the exploded view (a kit option shows there only as the drawn model); no
post.js or light.js changes; no baked livery layers on kit geometry (kit
parts take region colour and finish; the livery lane's baked texture
targets stock UVs, see the plan file question).

## 10. Checks

- `kits:selftest` (Node, CI): catalogue ids, normalise and drops, migration
  seeds, code round trip, physics-zero 1, 2 and 4.
- `kits:replay` (Node): physics-zero 3.
- `kits:hangar` (browser, real pointer): open each family, fit each slot,
  pictures to ~/.cache/fdfpv-w34-kits/.
- `kits:perf` (browser, quiet GPU): section 4.
- lint:header, lint:dashes, lint:copy (en and es) on every PR.

## 11. Owner questions (recommended option first)

1. Shop share: two Shop and one earned option per family, the rest free.
   Recommended: yes.
2. Peers' `battery` LED pattern shows as solid (the room pose has no
   pack voltage). Recommended: yes, rather than widen the room pose.
