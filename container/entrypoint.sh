#!/usr/bin/env bash
# Container boot (runs as root under --init): restore the unit directory in the
# home volume, start any enabled units (failproofaid once configured), then idle.
# All work happens through `docker exec -u node`.
set -eu
mkdir -p /home/node/.systemd-units
chown node:node /home/node
/usr/local/bin/systemctl start-enabled || true
# Live trace viewer (harness/live), if present: http://localhost:4777 on the host.
if [ -f /work/harness/live/server.mjs ]; then
  sudo -u node -H bash -c 'cd /work && exec node harness/live/server.mjs >>/tmp/live.log 2>&1' &
fi
exec sleep infinity
