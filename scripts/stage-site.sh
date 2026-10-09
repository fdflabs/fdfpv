#!/bin/bash
# stage-site.sh: copy the served tree into a site directory, the one tree
# GitHub Pages publishes on main and a pull request's preview publishes
# (.github/workflows/pages.yml, preview.yml, docs/PREVIEWS.md). One list of
# what is served, so a preview never flies a tree production would not.
#
# Usage: scripts/stage-site.sh <site dir>
#
# This file is part of the Paraguayan Drone Combat Simulator.
#
# The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or (at
# your option) any later version.
#
# The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY, without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
set -euo pipefail
site=${1:?usage: stage-site.sh <site dir>}
mkdir -p "$site"
rsync -a --exclude .git --exclude .github --exclude vendor --exclude node_modules \
  --exclude build --exclude patches --exclude tracks --exclude edge --exclude scripts \
  --exclude 'tests/browser' --exclude 'tests/fixtures' --exclude 'tests/gen' \
  --exclude 'tests/inputs' --exclude 'tests/verify.js' --exclude 'tests/*.json' \
  --exclude '*.md' --exclude LICENSE --exclude NOTICE --exclude package.json \
  --exclude render.yaml --exclude gates.config.json \
  ./ "$site/"
cp LICENSE NOTICE "$site/"
du -sh "$site"
test -f "$site/dist/sim.wasm"
test -f "$site/tests/lib/simmod.js"
