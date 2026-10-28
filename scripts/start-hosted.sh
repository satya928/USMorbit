#!/usr/bin/env sh
# Start command for hosted test instances (Render, Railway, a VPS without Docker, ...).
# Applies migrations, optionally loads fictional demo data (only if it is not already there),
# then starts the standalone production server.
set -e
npm run db:migrate
if [ "$SEED_DEMO_DATA" = "true" ]; then
  ALLOW_DEMO_SEED=true npm run db:seed
fi
export HOSTNAME="${HOSTNAME_BIND:-0.0.0.0}"
exec node .next/standalone/server.js
