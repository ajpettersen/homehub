#!/bin/bash
set -e

export CI=1
export PNPM_DISABLE_SELF_UPDATE_CHECK=1

pnpm install --frozen-lockfile --prefer-offline --reporter=append-only
PGCONNECT_TIMEOUT=10 node lib/db/migrate.mjs
