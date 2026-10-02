# Itaipu: the photographs its ground is made of

Every file under `assets/itaipu/ground/` is from Poly Haven and is CC0
1.0: public domain, no attribution required. The authors are named here
anyway. They are material photographs laid on the ground by
`src/maps/itaipu/look/ground.js`, whose colour comes from the Sentinel-2
imagery (docs/ITAIPU-PLAN.md); none of them is a photograph of the place.
The ground also reads two of swiss2's files, the shore gravel and the
rock, listed with their sources in docs/SWISS2-ASSETS.md.

Total: **3.68 MB** (3,679,701 bytes) in 10 files.

## How the files were made

Downloaded with curl from `api.polyhaven.com` (the 1k JPG Diffuse,
nor_gl and Displacement maps) and packed by `tools/itaipu/pack_ground.py`
as swiss2's terrain layers are: `<name>_col.jpg` the albedo at JPEG
quality 84, `<name>_nrh.jpg` the OpenGL normal in red and green and the
displacement in blue at quality 88, 1024 square, rows top first. At load
the seven layers the ground reads (these five and swiss2's two) become
two texture arrays, 1024 square on High and 512 on Medium and Low.

## Layers (texture array order, look/ground.js LAYERS)

| Layer | File stem | Source | Authors | Tile | Used for |
|---|---|---|---|---|---|
| 0 forest | `litter` | [Dry Decay Leaves](https://polyhaven.com/a/dry_decay_leaves), Poly Haven | Amal Kumar | 2.0 m | the forest floor: dry broad leaves |
| 1 field | `grass` | [Leafy Grass](https://polyhaven.com/a/leafy_grass), Poly Haven | Charlotte Baglioni | 2.0 m | pasture and the crops' leaves |
| 2 sparse | `grass_sparse` | [Sparse Grass](https://polyhaven.com/a/sparse_grass), Poly Haven | Amal Kumar | 2.0 m | the second, larger read under the field and the forest floor, so neither tiles |
| 3 soil | `laterite` | [Red Laterite Soil Stones](https://polyhaven.com/a/red_laterite_soil_stones), Poly Haven | Amal Kumar | 2.0 m | the red soil (terra roxa) |
| 4 tracks | `tracks` | [Muddy Tracks](https://polyhaven.com/a/muddy_tracks), Poly Haven | Amal Kumar | 2.25 m | the dirt tracks across pasture and red soil |
| 5 urban | swiss2 `shore` | see docs/SWISS2-ASSETS.md | | 3.0 m | gravel and paving in town |
| 6 rock | swiss2 `rock` | see docs/SWISS2-ASSETS.md | | 30 m (9 m on the canyon's faces) | the canyon's basalt |

The tile is the photograph's own size as Poly Haven gives it, so a leaf
or a stone is drawn at its real size.

## Sizes

| Files | Bytes |
|---|---|
| `litter_col.jpg`, `litter_nrh.jpg` | 524,268 |
| `grass_col.jpg`, `grass_nrh.jpg` | 933,247 |
| `grass_sparse_col.jpg`, `grass_sparse_nrh.jpg` | 789,510 |
| `laterite_col.jpg`, `laterite_nrh.jpg` | 801,610 |
| `tracks_col.jpg`, `tracks_nrh.jpg` | 631,066 |
| **total under assets/itaipu/ground/** | **3,679,701** |

On the GPU at High: the two arrays, 7 layers of 1024 square RGBA8 with
mipmaps, 74.7 MB between them, where swiss2's nine layer arrays the
ground read before were 96 MB.
