#!/usr/bin/env bash
# AREA — Rust hardening build helper.
#
# Builds in release with symbols stripped and removes the cargo-auditable
# `.dep-v0` section, defeating REA's inspect_rust_binary metadata enumeration.
#
# Usage:
#   ./harden-rust.sh [--release] [--features foo]   # builds the crate
#   ./harden-rust.sh --strip-binary /path/to/binary # post-process an existing binary
set -euo pipefail

STRIP_BIN=""

if [[ "${1:-}" == "--strip-binary" ]]; then
  STRIP_BIN="${2:-}"
fi

if [[ -n "$STRIP_BIN" ]]; then
  echo "== Stripping $STRIP_BIN"
  strip -S -x -s "$STRIP_BIN" 2>/dev/null || strip "$STRIP_BIN"
  strip -R .dep-v0 "$STRIP_BIN" 2>/dev/null || objcopy --remove-section=.dep-v0 "$STRIP_BIN" 2>/dev/null || true
  echo "== Done."
  exit 0
fi

echo "== release build (stripped, no auditable metadata)"

# Add cargo-auditable removal note: cargo-auditable is only active when built
# via `cargo auditable build`. A plain release build never emits .dep-v0, but if
# a transitive tool did, strip it below.
cargo build --release "${@}"

BIN_DIR="target/release"
for bin in "$BIN_DIR"/*; do
  [[ -f "$bin" ]] || continue
  [[ -x "$bin" ]] || continue
  echo "  stripping $bin"
  strip -S -x -s "$bin" 2>/dev/null || strip "$bin" || true
  strip -R .dep-v0 "$bin" 2>/dev/null || objcopy --remove-section=.dep-v0 "$bin" 2>/dev/null || true
done

echo "== Done. Binaries in $BIN_DIR"
