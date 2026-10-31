#!/usr/bin/env bash
# AREA — native binary stripping + optional packing.
#
# Removes symbols, build-id, and (where present) metadata sections that feed
# REA's inspect_binary_layout / inspect_elf_notes / inspect_macho /
# inspect_rust_binary / inspect_pe_imports.
#
# Usage:
#   ./strip-native.sh /path/to/binary [--upx]
set -euo pipefail

BIN="${1:-}"
UPX="${2:-}"

if [[ -z "$BIN" || ! -f "$BIN" ]]; then
  echo "Usage: $0 /path/to/binary [--upx]" >&2
  exit 2
fi

echo "== Stripping $BIN"

# Full symbol stripping (works on ELF and Mach-O).
strip -S -x -s "$BIN" 2>/dev/null || strip "$BIN" || echo "  (strip not available; continuing)"

# Remove GNU build-id and note sections (ELF).
for sec in .note.gnu.build-id .note.ABI-tag .dep-v0 .comment; do
  if objcopy --remove-section="$sec" "$BIN" 2>/dev/null; then
    echo "  removed section $sec"
  fi
done

# Rust cargo-auditable metadata (defeats inspect_rust_binary).
strip -R .dep-v0 "$BIN" 2>/dev/null || true

# Go build metadata (defeats inspect_go_binary).
if command -v go >/dev/null 2>&1; then
  go tool buildid -w "$BIN" 2>/dev/null && echo "  cleared go build id" || true
fi

if [[ "$UPX" == "--upx" ]]; then
  if command -v upx >/dev/null 2>&1; then
    upx --best --lzma "$BIN" && echo "  packed with upx"
  else
    echo "  (upx not found; skipping pack)" >&2
  fi
fi

echo "== Done. Verify with: rea open_binary $BIN && analyze_function"
