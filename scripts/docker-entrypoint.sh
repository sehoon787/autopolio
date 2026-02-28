#!/bin/sh
# Copy host .env (read-only mount) to writable internal path
# This ensures the host .env is never modified by the container.
cp /app/.env.init /app/.env 2>/dev/null || true

exec "$@"
