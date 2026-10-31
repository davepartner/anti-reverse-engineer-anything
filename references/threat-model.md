# Threat model: how REA works and where to break it

This is the mental model AREA is built on. A reverse-engineering agent using
REA (`reverse-engineer-anything`) does not "hack" your software — it reads the
information you accidentally left in it and observes the behavior you left
unprotected. Remove the information and close the observation channels, and its
evidence ledger fills with `unknown` instead of findings.

## The three pillars REA depends on

### 1. Readable static artifacts

REA's built-in parsers work because formats are predictable and unencrypted:

- **JavaScript**: `analyze_javascript_application` reads source text, builds a
  module graph, finds routes, IPC channels, and literal strings, and — critically
  — consumes **source maps** to reconstruct original names and paths.
  `recover_javascript_sources` (Wakaru) de-minifies readable bundles.
- **Native**: `open_binary` + `analyze_function` produce pseudocode and recover
  callers/callees/strings via Ghidra, Hopper, IDA, or Kuna. This works because
  symbols, section names, plaintext strings, and standard import tables are present.
- **Metadata**: `inspect_go_binary`, `inspect_rust_binary`, `inspect_pe_imports`,
  `inspect_pe_load_config`, `inspect_elf_notes`, `inspect_python_pyc`,
  `inspect_il2cpp_metadata`, `inspect_sqlite_database`, etc. read *declarative*
  metadata you embedded at build time.

**Break it**: ship obfuscated, stripped, encrypted artifacts with no source maps,
no symbols, no build metadata, and no plaintext strings.

### 2. Open runtime surfaces

REA observes runtime behavior through well-known debug/automation channels:

- **Browser/CDP**: `list_browser_targets`, `capture_browser_scenario`,
  `observe_web_execution`, `inspect_web_event_listeners` all ride the Chrome
  DevTools Protocol (CDP) endpoint.
- **Electron**: `list_electron_targets`, `--inspect`, remote debugging ports.
- **Native**: LLDB (`observe_native_calls`), Frida (`start_frida_session`,
  `load_frida_script`), GDB/Rizin debuggers. LLDB on hardened macOS needs the
  `get-task-allow` entitlement.

**Break it**: detect and disable these surfaces — anti-debug, anti-Frida,
anti-CDP, Electron fuses, no `get-task-allow`.

### 3. Stable identity

REA fingerprints artifacts by SHA-256 and correlates across versions with
`compare_application_versions`, `match_native_functions`, and export-shape
diffing. Deterministic builds + persistent identifiers make "what changed"
answerable with a single diff.

**Break it**: polymorphic builds — re-obfuscate with a fresh seed each release,
randomize identifiers, so two versions share almost no stable identity.

## The counter map (full)

| REA capability | Assumption it relies on | AREA countermeasure |
| --- | --- | --- |
| JS source reading & module graph | Bundled JS is plaintext | Obfuscation, mangling, control-flow flattening, V8 bytecode |
| Source-map recovery | `.map` files or `sourceMappingURL` ship | Strip source maps, disable map generation |
| Wakaru de-minification | Only minification applied | Apply transforms Wakaru can't invert (flattening, opaque predicates, self-defending) |
| Route/IPC/string enumeration | Literal strings present | Encrypt strings, dynamic property access, computed IPC channel names |
| Version diffing | Stable identifiers across builds | Per-build re-obfuscation seed, randomized names |
| Native pseudocode/decompile | Unobfuscated machine code | OLLVM/garble, packing, opaque predicates, string encryption |
| Symbol/import/export enumeration | Symbol tables + import/export tables intact | Strip symbols, dynamic import resolution, minimize exports |
| Debugger attach (LLDB/GDB/Rizin) | No anti-debug, `get-task-allow` present | Anti-debug primitives, hardened runtime, remove entitlement |
| Frida instrumentation | No anti-Frida | Frida server/agent detection, port 27042 scan, ptrace guard |
| CDP/DevTools observation | Remote debugging enabled, no detection | Kill remote debugging, DevTools-open detection, `navigator.webdriver` guard |
| AgentEnv clone capture | Client contains complete standalone logic | Thin client + server-side logic + auth + streaming |
| Network MITM capture | Plaintext TLS, no pinning | Certificate pinning + app-layer encryption |
| Metadata fingerprinting | Build metadata embedded | Strip `.go.buildinfo`, `.dep-v0`, build-id, certs, `.pyc` headers |
| Static DB inspection | Plaintext SQLite shipped | Encrypt DB (SQLCipher), keep secrets server-side |

## The goal state

A correctly hardened artifact makes a REA pass return, for every interesting
question, one of:

- `coverage: incomplete` / `exhausted: false`
- `unknown` (absence of observable evidence)
- `limitations: [...]` (unresolved because the seam was removed)

That is the definition of success: not "REA crashes," but "REA has nothing
citable to stand on." Prefer **denial of evidence** over active interference —
every active check you add is itself a signature an analyst can locate and patch.
Layer passive hardening (obfuscation, stripping, encryption) as the base, then
add active detection (anti-debug, anti-Frida, anti-CDP) as a second, removable
frustration layer.

## Deterrence, not proof

Obfuscation, packing, and anti-debug raise the cost and lower the yield of
analysis; they do not make software mathematically un-analyzable. A skilled
analyst with unlimited time and budget can still reverse anything that runs on
their machine. The practical win is: (a) casual cloning becomes infeasible,
(b) AI agents that rely on *citable evidence* stall because the evidence is gone,
and (c) the few people who could still reverse it face a much higher bill than
the software is worth.

Keep anything genuinely secret — keys, credentials, proprietary algorithms with
real value — **server-side**, never in the client.
