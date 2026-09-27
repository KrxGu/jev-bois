# syntax=docker/dockerfile:1.7
# Isolated box for the Jev Buildathon.
#   - Only ~/Desktop/code/buildathon is mounted (at /work). Host ~/.claude, keys and
#     work sessions are never visible, so failproofai in here can only see and upload
#     the sessions run in here.
#   - $HOME lives in a named volume (jev-home): Claude login, failproofai config and
#     the daemon's unit file persist across rebuilds and stay out of the host home.
#   - The container stays up (entrypoint idles) so failproofaid keeps running between
#     commands; commands run via `docker exec -u node` (see container/jev).
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    DISABLE_AUTOUPDATER=1 \
    FAILPROOFAI_TELEMETRY_DISABLED=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git sudo procps \
 && rm -rf /var/lib/apt/lists/*

# Claude Code: same version the host already runs (2.1.283; 2.1.278 is rejected by the API for
# claude-haiku-4-5: "2.1.280 or newer is required"), via the org npm registry
# (host ~/.npmrc passed as a BuildKit secret; never written into a layer).
ARG CLAUDE_CODE_VERSION=2.1.283
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
 && npm cache clean --force

# failproofai: installed from public npm,
# inside this container only. Pinned; no install scripts run.
ARG FAILPROOFAI_VERSION=1.0.8
RUN npm install -g --ignore-scripts --registry=https://registry.npmjs.org/ "failproofai@${FAILPROOFAI_VERSION}" \
 && npm cache clean --force

# No systemd in a container: a small systemctl stand-in runs failproofaid's unit.
# failproofai's service install needs non-interactive sudo; the node user gets it here
# (root inside this container only).
COPY systemctl-shim /usr/local/bin/systemctl
COPY entrypoint.sh /usr/local/bin/jev-entrypoint
RUN chmod 0755 /usr/local/bin/systemctl /usr/local/bin/jev-entrypoint \
 && echo "node ALL=(ALL) NOPASSWD: ALL" >/etc/sudoers.d/node && chmod 0440 /etc/sudoers.d/node \
 && mkdir -p /etc/systemd \
 && rm -rf /etc/systemd/system && ln -s /home/node/.systemd-units /etc/systemd/system

WORKDIR /work
ENTRYPOINT ["/usr/local/bin/jev-entrypoint"]
