#!/usr/bin/env bash
# AREA — Go hardening build helper.
#
# Wraps `garble` for literal obfuscation + stripping of .go.buildinfo,
# defeating REA's inspect_go_binary and native analyze_function passes.
#
# Requires: garble (go install mvdan.cc/garble@latest)
# Usage:
#   ./harden-go.sh ./cmd/myapp            # builds ./cmd/myapp with a random seed
#   ./harden-go.sh ./... --seed=12345
set -euo pipefail

PKG="${1:-./...}"
SEED="${SEED:-$RANDOM}"

if ! command -v garble >/dev/null 2>&1; then
  echo "garble not found. Install with: go install mvdan.cc/garble@latest" >&2
  exit 2
fi

echo "== garble build: $PKG (seed=$SEED)"

garble -literals -tiny -seed="$SEED" build \
  -trimpath \
  -buildvcs=false \
  -ldflags="-s -w -buildid=" \
  "$PKG"

echo "== Done. For a single binary, additionally run:"
echo "   go tool buildid -w <binary>   # clear build id"
echo "   strip -S -x -s <binary>       # drop symbols"
