#!/bin/sh
set -eu
mkdir -p "${MEDIA_ROOT:-/data/media}" "${PUBLISH_ROOT:-/data/published}"
node --import @swc-node/register/esm-register packages/database/src/migrate.ts
exec node --import @swc-node/register/esm-register apps/api/src/main.ts
