#!/bin/sh
set -e

echo "[entrypoint] aplicando migrations..."
npx prisma migrate deploy

exec "$@"
