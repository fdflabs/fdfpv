# Layered livery editor (owner 2026-10-07, step 1 of NFS level customization)

**Status: CONTRACT** (2026-10-07), lane "livery" of Waves 3/4. Builds on the
paint lane's contract (docs/redesign/WORKSHOP-PAINT.md: regions, underside
colours, click to paint, Flip, views, undo, A/B, patterns, swatches) and does
not repeat any of it.

## 1. What already exists (checked against origin/main bce6de00)

The paint shop's DECALS are already a small layer stack: an ordered list per
aircraft (`entry.decals`, configs/paint.js), each a kind (number, stripe,
checks, chevron, star, roundel, bolt, flames, shield, wings, skull, shark
mouth, Paraguay flag, the pilot's words, ribbon), two colours, a point and a
normal on the model, a size, a stretch, a turn and a mirror copy across the
centreline. They are projected onto the model (src/render/decals.js), drawn
from ONE atlas per aircraft, merged into one mesh per moving part, carried in
livery codes (`FPV1-`), saved liveries, builds, replays, the account sync
(`livery` keyed, `liverySaves` union) and room profiles (src/render/peers.js
dresses other pilots' aircraft with them). Max 16.

So the layer editor is NOT a second system. **A layer is a decal**, and this
lane grows the decal into a full layer. One list, one renderer, one code.

## 2. What the player sees

The Colours tab's Decals page becomes **Layers**: a list, top layer first,
each row a thumbnail, its name, an eye (hide) and a lock. Add a layer from
three libraries: **Shapes** (stripes, chevrons, circles, stars, flames, digits,
letters...), **Text** (the four stroke fonts the game ships, the pilot's
callsign pre-filled) and **Stamps** (curated marks drawn by
src/render/decalart.js; no uploads). The chosen layer shows a transform gizmo
over the model: drag to move on the surface, corner handles scale, a top
handle rotates, side handles stretch, a skew handle shears. Colour, second
colour, finish (gloss, matte, metallic, chrome), opacity. Mirror across the
centreline. Order: up, down, to top, to bottom. Duplicate, delete, group and
ungroup (a group moves, scales and turns as one), lock, hide. Snap: to the
centreline, to 15 degree turns and to other layers' centres. Undo and redo.
Keyboard and mouse first; a pad moves the list, the aim and the basic
transform; on a phone the list and the buttons stay readable (no gizmo
handles under 44 px).

## 3. Data shape

A decal (configs/paint.js checkDecal) gains OPTIONAL keys; absent means
today's behaviour exactly, so every stored entry, saved livery, build, replay
and v1 code reads as before:

| key | meaning | range |
| --- | --- | --- |
| `x` | skew, degrees, image up leaned toward image right | -60..60, whole degrees, 0 is absent |
| `o` | opacity, percent | 5..100 in steps of 5, 100 is absent |
| `fi` | the layer's finish | gloss, matte, metallic, chrome; gloss is absent |
| `g` | group number | 1..99 |
| `h` | hidden | true, else absent |
| `l` | locked (editor only) | true, else absent |

The list cap goes from 16 to **MAX_DECALS = 32**. Why 32 and not 200: every
place a livery travels has a byte cap set on the server: a build 8 kB
(tracks-api/limits.js BUILD_MAX_CHARS), a room profile 4 kB
(src/share/roomwire.js), a code 6000 characters. 32 layers with every field
set fit the build cap as stored; the room profile and the code carry the
layers PACKED (below). More than 32 needs those caps raised on the VM: an
owner call, listed in section 7.

**Packed form.** A layer as a short array, numbers as integers (millimetres,
thousandths of the normal, hundredths of the stretch):
`[k, px, py, pz, nx, ny, nz, s, a, r, c, c2, flags, x, o, fi, g, t, f]`,
trailing defaults dropped, colours without '#'. About 60 bytes against 110 to
180 as an object. configs/paint.js packDecals/unpackDecals; unpack runs
checkDecal, so a packed layer is held to exactly the same rules.

**Codes, versioned.** A v1 code (`v: 1`, object decals) keeps loading. New
codes are `v: 2`: the same wrapper, the entry's decals packed under `d`.
A v2 code a v1 build reads is refused with its existing "made by a newer
version" sentence.

**Account sync.** No shape change on the server (it checks shape only for
builds and loadouts), so no VM deploy. Old data needs no rewrite, the keys
are optional; the migration is the check: paint:selftest seeds a pre-layer
settings blob, saves list, build and v1 code and proves they load unchanged
and merge unchanged. Known edge: a browser tab left open from before this
change drops a decal with a new key when it reads it; it does not write it
back unless the pilot repaints that aircraft there.

## 4. Projection: projected, not UV. Why

The aircraft builders make their skins from lofts and merged pieces with no
texture layout, so there is no UV space to paint into without unwrapping 18
families by hand. The projected box (src/render/decals.js) already reads
correctly across regions, onto the underside (its normal faces down), over
moving surfaces (a layer on an aileron is that aileron's child) and stops at
skin that covers it. A layer is that box; skew shears its picture, opacity is
the picture's alpha, finish picks one of four shared sticker materials.

## 5. Cost: the bake and its budget

Every layer of an aircraft is drawn into ONE atlas texture per livery (the
bake), packed by each layer's own shape so a long stripe gets a long cell.
Geometry is made once when the paint changes; per frame a livery costs one
draw call per moving part per finish in use. Atlas side by graphics preset:
low 512, medium 1024, high 2048, and never larger than the layers need (up to 4 layers 512, up to 16 1024); the hangar model takes the preset too. Measured
in the baker PR: the time to dress each family with 32 layers and the frame
time of a room view with 7 peers wearing 32 layers, on a quiet GPU
(`nvidia-smi pmon -c 1` shows no other renderer).

## 6. PRs

1. This contract, the data keys, the cap, the packed form, codes v2, the
   seeded old data check (paint:selftest).
2. Baker: skew, opacity, finish, hidden in decals.js; atlas by preset and
   shaped cells; livery:perf.
3. Editor: the Layers list (order, duplicate, lock, hide), the gizmo on the
   model, undo and redo; livery:editor browser check with a real pointer,
   pictures of every family.
4. Libraries: shapes, letters, stamps, the callsign.
5. Mirror, snap, groups.
6. Rooms: the profile carries the packed layers.

## 7. What it does NOT do, and owner questions

- No uploads, no images from outside the game, no paid items. New library
  shapes are free (not level locked) so the unlock ladder does not stretch
  (lead decision; the existing kinds keep their levels).
- No UV unwrap, no per pixel painting brush.
- Owner question: more than 32 layers needs the build and room profile caps
  raised on the VM (recommended: 64 layers, build 16 kB, profile 8 kB).

## 8. Checks

- paint:selftest (Node, CI): new keys round trip, bad values dropped, packed
  form equals object form, v1 and v2 codes, seeded old data unchanged, 32
  full layers fit a code and the build cap.
- livery:perf (browser, slot script): dress time per family and room frame
  time, numbers in the PR.
- livery:editor (browser, slot script): real pointer, pictures of every
  family to ~/.cache/fdfpv-w34-livery/.
- lint:header, lint:dashes, lint:copy.
