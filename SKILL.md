---
name: anti-reverse-engineer-anything
description: >-
  Harden software so AI reverse-engineering agents (REA, "reverse-engineer-anything",
  Ghidra/Hopper/IDA/Kuna, Frida, LLDB, GDB, CDP/DevTools, Wakaru) fail or stall when they
  try to decompile, clone, or fingerprint your shipped app. Use when building or shipping
  proprietary/closed-source software, Electron/Node/JavaScript apps, native binaries
  (C/C++/Rust/Go), mobile apps, or web apps that must resist decompilation, cloning,
  source recovery, source-map recovery, string extraction, import/export enumeration,
  build-metadata fingerprinting, runtime instrumentation, debugger attach, Frida hooking,
  DevTools/remote-debugging access, and AgentEnv bundle capture. Applies obfuscation,
  control-flow flattening, string encryption, symbol stripping, packers, anti-debug,
  anti-Frida, anti-tamper integrity checks, Electron fuses, asar integrity, cert pinning,
  and metadata stripping. NOT for malware evasion or defeating license-check legal
  enforcement on others' software; use only on software you own or are authorized to protect.
---

# AREA — Anti-Reverse-Engineer-Anything

Counter-skill to `reverse-engineer-anything` (REA) and the wider class of AI-assisted
reverse-engineering tooling. Where REA recovers readable source, names, strings, imports,
call graphs, and runtime behavior from a shipped artifact, AREA removes the assumptions
REA depends on, so a REA-driven agent hits dead ends instead of conclusions.

## When to apply

Apply this skill **before shipping** any software you own and do not want cloned,
decompiled, or fingerprinted. It is most valuable for:

- Electron / Node.js / JavaScript apps (desktop + web bundles)
- Native binaries: C, C++, Objective-C, Rust, Go
- Managed .NET / Java / Kotlin / Android / iOS apps
- Any app whose secret sauce lives in the client instead of a server

## The core insight

REA is *evidence-bound and assumption-bound*. It can only conclude what it can
observe, and it can only observe what the shipped artifact lets it:

1. **Static artifacts** are readable: JS source text, source maps, symbol tables,
   import/export tables, plaintext strings, embedded build metadata.
2. **Runtime surfaces** are open: CDP/DevTools ports, `--inspect`, Frida/GDB/LLDB
   attach, unhardened runtimes.
3. **Identity is stable**: SHA-256 digests, deterministic builds, persistent
   identifiers make version diffing and fingerprinting trivial.

Every countermeasure removes one of these assumptions. A REA agent that cannot
read source, cannot attach a debugger, and cannot fingerprint the build reports
*"unknown"* everywhere instead of a reconstruction.

## Quick map: REA tool → AREA counter

| REA surface (what it attacks) | AREA counter (what you ship) | Reference |
| --- | --- | --- |
| `analyze_javascript_application`, `recover_javascript_sources`, `trace_application_feature` | Obfuscate + mangle, remove source maps, compile JS to V8 bytecode (`bytenode`), split logic to native addons | [javascript-electron-hardening.md](references/javascript-electron-hardening.md) |
| `compare_application_versions`, `compare_javascript_export_shapes` | Per-build re-obfuscation with a random seed/salt; polymorphic identifiers | same |
| `inspect_electron_fuses`, `list_electron_targets`, CDP debug | Flip Electron fuses to kill `--inspect`/`RunAsNode`/`NODE_OPTIONS`; enable asar integrity | same |
| `open_binary` + `analyze_function` + pseudocode/strings/xrefs (Ghidra/Hopper/IDA/Kuna) | OLLVM/garble obfuscation, string encryption, opaque predicates, control-flow flattening, packing | [native-hardening.md](references/native-hardening.md) |
| `inspect_binary_layout`, `inspect_pe_imports`, `inspect_native_exports`, `inspect_elf_notes`, `inspect_macho` | Strip symbols/build-id/section names, dynamic import resolution, minimize exports | [native-hardening.md](references/native-hardening.md) + [metadata-stripping.md](references/metadata-stripping.md) |
| `observe_native_calls` (LLDB), `start_gdb_session`, `start_rizin_debug_session` | Anti-debug (`PT_DENY_ATTACH`, `sysctl P_TRACED`, `PTRACE_TRACEME`), remove `get-task-allow` | [native-hardening.md](references/native-hardening.md) |
| `start_frida_session`, `load_frida_script` | Anti-Frida (scan port 27042, detect agent/gadget strings, `ptrace` guard) | [native-hardening.md](references/native-hardening.md) |
| `list_browser_targets`, `capture_browser_scenario`, `observe_web_execution`, `inspect_web_event_listeners`, WebMCP discovery | Anti-CDP/DevTools detection, `navigator.webdriver` guard, declare no WebMCP tools, strict CSP | [web-and-runtime-hardening.md](references/web-and-runtime-hardening.md) |
| `export_environment_bundle` (AgentEnv clone capture) | Thin client + server-side logic + auth + streaming so a captured bundle is useless | [web-and-runtime-hardening.md](references/web-and-runtime-hardening.md) |
| `inspect_go_binary`, `inspect_rust_binary`, `inspect_pe_certificates`, `inspect_pe_load_config`, `inspect_python_pyc`, `inspect_il2cpp_metadata`, `inspect_sqlite_database` | Strip build metadata (`.go.buildinfo`, `.dep-v0`, build-id), compile Python to native, encrypt IL2CPP metadata and databases | [metadata-stripping.md](references/metadata-stripping.md) |
| Network captures (SAZ/HAR/mitmproxy/PCAP) | Certificate pinning + application-layer payload encryption | [web-and-runtime-hardening.md](references/web-and-runtime-hardening.md) |

## How to use

1. Read [references/threat-model.md](references/threat-model.md) to understand exactly
   what a REA-driven agent will try and where each technique bites.
2. Pick the hardening track for your stack and apply it **before** the release build,
   not after. Obfuscation and stripping must happen on the artifact that ships.
3. Run the matching script in [scripts/](scripts/) on your release artifact.
4. Verify with a REA pass yourself: run `analyze_javascript_application` /
   `open_binary` against your hardened artifact and confirm the agent reports
   `unknown` / `coverage: incomplete` rather than recovered logic.
5. Keep the *unhardened* source in private version control only. Never ship debug
   symbols, source maps, or `.pdb`/`dSYM` sidecars.

## Tracks

- **JavaScript / Electron** → [javascript-electron-hardening.md](references/javascript-electron-hardening.md)
- **Native (C/C++/ObjC/Rust/Go)** → [native-hardening.md](references/native-hardening.md)
- **Web app / runtime / AgentEnv** → [web-and-runtime-hardening.md](references/web-and-runtime-hardening.md)
- **Metadata & fingerprint stripping** → [metadata-stripping.md](references/metadata-stripping.md)

## Scripts

- `scripts/obfuscate-javascript.mjs` — `javascript-obfuscator` wrapper with AREA defaults.
- `scripts/harden-electron.js` — applies Electron fuses + asar integrity + kills source maps.
- `scripts/strip-native.sh` — symbol/build-id/section stripping + optional packer.
- `scripts/harden-go.sh` — garble + `-trimpath` + strip `.go.buildinfo`.
- `scripts/harden-rust.sh` — strip `.dep-v0` (cargo-auditable) metadata.
- `scripts/anti-debug.h` — C/C++ anti-debug + anti-Frida + anti-LLDB/GDB primitives.
- `scripts/integrity-check.js` — runtime asar/binary integrity verification.
- `scripts/generate-csp.cjs` — emits a strict CSP + anti-automation headers.

## Rules

- Only harden software you own or are authorized to protect.
- Obfuscation and anti-debug are **deterrence**, not provable security: raise the
  cost of analysis; never rely on them as the sole protection for anything secret.
- Keep a clean, unhardened build in CI for internal debugging; ship only hardened artifacts.
- Never ship credentials, keys, or secrets inside a client, no matter how obfuscated.
