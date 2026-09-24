# build.py: the whole pipeline in order: fetch the sources, build every
# part of the data folder, write the manifest, validate.
#
# Usage: uv run python build.py
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

import build_dem
import build_hydro
import build_landcover
import build_roads
import build_thermal
import fetch
import manifest
import validate

if __name__ == '__main__':
    reg = fetch.Registry()
    for step in fetch.STEPS.values():
        step(reg)
    for step in (build_dem, build_landcover, build_hydro, build_thermal, build_roads, manifest, validate):
        print(f'== {step.__name__}')
        step.main()
