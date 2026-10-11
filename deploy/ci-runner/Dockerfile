# The self-hosted runner for the `node` job of .github/workflows/checks.yml,
# on the owner's DESKTOP (README.md). One container takes one job and exits.
#
# The image holds the runner agent and what the 229 steps of that job shell
# out to, found by running the job in it, not guessed: Node 22, git, python3
# (voice:check), rsync (preview:check stages the site with it), procps, and
# a Chrome where tests/lib/browser.js findChrome looks
# (/usr/bin/google-chrome). Ubuntu
# 24.04's `chromium` package is a snap stub that cannot run in a container, so
# Chrome comes from Google's apt repository.
#
# There is no sudo, no Docker socket and no credential in the image. The
# container runs as uid 1001 from its first instruction; the registration
# token arrives on stdin (entrypoint.sh) and is never in the environment.
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

FROM ubuntu:24.04

# The same base as GitHub's ubuntu-latest, so fonts and libraries resolve the
# way they do for a fork's run there. The fonts are the system fallbacks the
# page's own @font-face faces drop to (monospace, emoji).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git jq tar gzip unzip zstd xz-utils gnupg \
      libicu74 python3 procps rsync \
      fonts-liberation fonts-dejavu-core fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
         | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] \
https://dl.google.com/linux/chrome/deb/ stable main" \
         > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/* \
    && google-chrome --version

# Node in the tool cache's own layout, so actions/setup-node's `node-version:
# 22` finds it there and downloads nothing. The checksum pins the tarball;
# bumping the version means bumping it in the same commit.
ARG NODE_VERSION=22.23.3
ARG NODE_SHA256=df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de
ENV AGENT_TOOLSDIRECTORY=/opt/hostedtoolcache
RUN dir=/opt/hostedtoolcache/node/${NODE_VERSION}/x64 \
    && curl -fsSL -o /tmp/node.tar.xz \
         "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    && echo "${NODE_SHA256}  /tmp/node.tar.xz" | sha256sum -c - \
    && mkdir -p "$dir" \
    && tar xJf /tmp/node.tar.xz -C "$dir" --strip-components=1 \
    && rm /tmp/node.tar.xz \
    && touch "$dir.complete" \
    && ln -s "$dir/bin/node" "$dir/bin/npm" "$dir/bin/npx" /usr/local/bin/

ARG RUNNER_VERSION=2.338.0
ARG RUNNER_SHA256=af4b794c1bc41d73d40535e3fe092a39f9679cd8d965954c2aca25a05ca41d32
RUN useradd -m -u 1001 -s /bin/bash runner
WORKDIR /home/runner
RUN curl -fsSL -o runner.tar.gz \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" \
    && echo "${RUNNER_SHA256}  runner.tar.gz" | sha256sum -c - \
    && tar xzf runner.tar.gz \
    && rm runner.tar.gz \
    && ./bin/installdependencies.sh \
    && chown -R runner:runner /home/runner /opt/hostedtoolcache

# The npm cache is a volume shared by the slots (run-slot.sh). Docker creates
# a missing mountpoint as root, which would leave npm ci unable to write it.
RUN install -d -o runner -g runner /home/runner/.npm

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
USER runner
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
