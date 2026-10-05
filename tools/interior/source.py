# source.py: where the Interior's land comes from. THE ONLY FILE in the
# repository that names the source area, its coordinates or the source
# tiles (whose names carry latitude and longitude). The owner's rule
# (docs/campaign/interior/PLAN.md section 1): no real place name and no
# real coordinates anywhere a player can see, so nothing the build writes
# carries any of this, and scripts/interior-names.js fails any other
# tracked file of the Interior's that does.
#
# The area is a 23 km square of ranch land, cropland, gallery forest and a
# large forest block on a river of about 800 square kilometres of
# catchment, in northern Paraguay east of the Paraguay river, chosen
# because a river crosses it from one side to the other through the
# middle and the forest stands on one side of it. It was picked by a
# search over a few hundred candidate squares in the region at 120 m
# (the land cover and the bare earth model below, with a D8 flow
# accumulation): every orientation of each square scored on a river of
# 200 to 4000 square kilometres entering one side and leaving the
# opposite one, forest over more than 55 % of the quarter the story puts
# Monte Cerrado in and under 40 % of the quarter it puts the fields in,
# and no built up cell. It holds no settlement: ESA WorldCover marks no
# built up cell inside it.
#
# It is turned half a turn (ORIENT) before anything is written, so the
# game's north is the source's south: the story wants the forest to the
# north and east and the fields to the south west, and a turned square is
# also not a square anyone can lay over a map.
#
# This file is part of WebFPVSimulator.
#
# WebFPVSimulator is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or (at
# your option) any later version.
#
# WebFPVSimulator is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY, without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.

# The square's centre, degrees (WGS84), and the UTM zone it is built in.
CENTRE_LON = -56.2668
CENTRE_LAT = -22.2384
UTM = 'EPSG:32721'

# World axes from the source's: world x (east) and world z (south) as
# integer combinations of the source's easting offset e and northing
# offset n, metres from the centre. Half a turn: x = -e, z = n.
ORIENT = ((-1, 0), (0, 1))

# What is fetched: windowed reads of the cloud optimised GeoTIFFs, cut to
# FETCH_DEG around the centre, which covers the 23 km square at any turn.
FETCH_DEG = 0.16
# The river's catchment reaches far past the square, so the flow that
# finds it is worked out over a wider cut of the elevation (build.py).
FLOW_DEG = 0.42

ANADEM_URL = 'https://metadados.snirh.gov.br/files/anadem_v1_tiles/anadem_v1_21K.tif'
ANADEM_LICENCE = ('CC BY 4.0 (OpenTopography dataset OTSDEM.082025.4674.1). Cite Laipelt et al. 2024, '
                  '"ANADEM: A Digital Terrain Model for South America", Remote Sensing 16(13):2321, '
                  'doi:10.3390/rs16132321; ANA / IPH-UFRGS')

WORLDCOVER_URLS = [
    'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_S24W057_Map.tif',
]
WORLDCOVER_LICENCE = ('CC BY 4.0. "(c) ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data '
                      '(2021) processed by ESA WorldCover consortium"; Zanaga et al. 2022, '
                      'doi:10.5281/zenodo.7254221')
