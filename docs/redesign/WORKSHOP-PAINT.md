# Workshop and paint shop (Wave 4 items 22 and 23)

**Status: CONTRACT** (2026-10-07), lane "paint" of Waves 3/4. The owner's
complaint it answers: "the underside of the wing can't even be seen".

## 1. What already exists (checked against the tree, origin/main 736df09e)

Most of item 23 is built and live. The plan listed it as new; it is not.

| Plan asks for | Exists | Where |
| --- | --- | --- |
| Projected decals | yes | src/render/decals.js, placed by aiming (src/ui/hangar-paint.js DECALS page) |
| Callsign / text | yes | `text` and `num` decal kinds, four stroke fonts (configs/paint.js) |
| Finish per region | yes | gloss, matte, metallic, chrome, carbon, aluminium (src/render/finish.js) |
| Wear slider | yes, cosmetic | `wear` 0 to 100 in steps of 5 on the whole aircraft (finish.js scratches, tape, dull patches) |
| Swatch palette | yes | configs/liveries.js PALETTE, plus a custom colour per region |
| Livery codes | yes | encodeLivery / readCode, checked field by field (hangar-paint.js LIVERIES page) |
| Saved liveries by name | yes | `liverySaves`, written at once (onLibrary) |
| Account sync of liveries and builds | yes | src/share/progressmerge.js: `livery` keyed, `liverySaves` union, `builds` keyed; src/ui/accountui.js syncedView. The first sign in merges what this computer holds into the account, so the "one time upload" already happens. |
| Orbit camera | partly | drag turns, drag/I/K tilts, wheel/U/O zooms (src/ui/hangar.js); the camera stays between 0.02 and 1.45 rad over the floor, so the underside is never in view |
| Preset views | partly | top, side_left, side_right, nose, tail for decal work only (src/render/hangarstage.js VIEWS) |
| Symmetry | decals only | a decal's `mirror` copy on the other side |

## 2. What is missing, one PR each, in this order

1. **Flip** (this PR). The aircraft rolls inverted on its stand, a half
   turn about its own nose to tail axis, lifted clear of the floor while it
   turns, so the underside faces the camera from the same views. A button
   on the stage and the key **V**, everywhere in the hangar; a second press
   rolls it back, and a pad's right stick pressed in (R3) does the same.
   Closing the hangar puts it upright. An aircraft whose box is tallest at
   a fin (the F-16) rests on that fin when flipped; accepted for now. The camera does not go
   under the floor: the floor and its reflection are what make the stand a
   place, and the owner asked for the aircraft to roll.
2. **Preset views for the whole workshop**: Top, Bottom (top with Flip),
   Left, Right, Nose, Tail as a row on the stage, on every tab, not only
   the decal page. Builds on VIEWS and Flip.
3. **Top and bottom paint per region.** A region gets an underside colour
   (`under`: region id to 0xRRGGBB). Drawn in the finish layer's shader by
   the surface's normal in the aircraft's frame, so no builder is touched
   and stock stays exact (no `under` entry, no change). Versioned migration
   not needed: a new optional key, old entries read as "same as top".
4. **Click to paint with hover labels.** The pointer over the model names
   the region and side under it ("Wing, underside"); a click with a swatch
   chosen paints that region and side. Uses the decal aim's raycast
   (`aimed`), which already returns the hit in the model's frame; the hit
   mesh's material maps back to a region through `livery.materials()`.
5. **Symmetry and undo.** Symmetry needs nothing new: a region's colour
   is both sides at once, and a new decal already comes with its mirrored
   copy on (`m: true`, configs/paint.js newDecal). Undo: the last 30 paint
   changes since the hangar opened, the Undo button beside Reset or Z. A
   stack of whole entries, since an entry is small. A pad has no Undo:
   every pad button is already taken in the hangar.
6. **A/B against stock**: a Stock button on the stage (or H) shows the
   kit's look on the model; pressed again, the pilot's paint is back. A
   toggle, not a hold, since the hangar's keys arrive as presses only. Any
   paint change ends it. Nothing stored.
7. **Patterns masked per region**: camo, splinter, checks, stripes, as a
   pattern id plus a second colour per region, drawn in the same shader
   pass as 3, in the aircraft's own coordinates so every machine, peer and
   replay draws the same. Kept in the livery entry, so codes, saved
   liveries and the sync carry it with no new section.
8. **Swatch library**: the pilot's own colours, up to 16, newest first,
   under "My colours" on the Colours tab with Keep / Forget for the colour
   on show. Kept in settings as `swatches: { list }`, written at once, and
   synced as a `whole` section (the newer library wins). Older settings
   have no key and read as the empty library; anything malformed does too
   (paint:selftest). There is no save envelope with a version number yet
   (COMPLETENESS phase 19, src/share/save.js, is planned), so the
   migration is the load time normalisation every settings key has.
   Needs a VM deploy for the account server to keep the new section.

## 3. Data shapes

The livery entry (configs/liveries.js normaliseEntry) gains only optional
keys: `under` (3), `patterns` (7). Absent means today's look exactly. Flip,
views, hover, A/B and undo are view state only and are never stored.

## 4. What this does NOT do

- No real part wear (the "parts" lane's item 27); the wear slider stays cosmetic.
- No paid cosmetics, no shop, no locks (item 25, the economy lane).
- No real insignia; the flag stays horizontal; the Paraguayan flag decal is the only flag.
- No new aircraft regions in the builders.

## 5. The checks

- `paint:workshop` (new, browser): opens the hangar on one aircraft of
  each family, presses Flip with a real pointer, waits for the roll to land
  at pi, takes a top and a bottom picture, and checks the roll returns to 0
  on a second press and on close. Each later PR adds its own steps.
- `paint:selftest` (Node, CI) for every new data key: old entries load
  unchanged, bad values are dropped.
- lint:header, lint:dashes, lint:copy on every PR.
- Pictures of every aircraft family top and bottom go outside the repo,
  ~/.cache/fdfpv-w34-paint/.
