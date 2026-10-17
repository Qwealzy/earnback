#!/usr/bin/env bash
# Bundle deploy.ts with the project's own viem (from the Studio UI lockfile install) into deploy.js.
# Run in WSL: bash deploy/build.sh   then serve: python3 -m http.server 8080 --bind 127.0.0.1 -d deploy
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$HOME/earnback-deploy"
mkdir -p "$WORK"
cp "$HERE/deploy.ts" "$WORK/deploy.ts"
ln -sfn "$HOME/retentionvault-ui/node_modules" "$WORK/node_modules"
grep -m1 '"version"' "$WORK/node_modules/viem/package.json" | sed 's/^ */viem /'
"$HOME/.bun/bin/bun" build "$WORK/deploy.ts" --target browser --format esm --minify --outfile "$HERE/deploy.js"
sha256sum "$HERE/deploy.js"
