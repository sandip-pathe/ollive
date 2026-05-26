#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/../apps/web"
node node_modules/next/dist/bin/next dev -p 3000
