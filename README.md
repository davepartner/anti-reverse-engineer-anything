# AREA — Anti-Reverse-Engineer-Anything

> Harden your software so AI reverse-engineering agents run into dead ends instead
> of conclusions.

**AREA** is a defensive skill and toolkit for developers who ship proprietary,
closed-source, or licensed software and don't want it decompiled, cloned,
de-obfuscated, fingerprinted, or instrumented — especially by AI agents using
[REA (`reverse-engineer-anything`)](https://github.com/morluto/rea) and its
analysis stack (Ghidra, Hopper, IDA, Kuna, Frida, LLDB, GDB, CDP/DevTools, Wakaru).

It is the **counter-skill** to `reverse-engineer-anything`: for every capability
REA exposes, AREA removes the assumption that capability depends on, so a
REA-driven agent reports `unknown` / `coverage: incomplete` instead of a
reconstruction.

## Keywords / coverage

`anti-reverse-engineering` · `obfuscation` · `anti-tamper` · `anti-debug` ·
`anti-Frida` · `anti-LLDB` · `anti-GDB` · `code protection` · `software protection` ·
`anti-clone` · `source-map stripping` · `JavaScript obfuscation` ·
`javascript-obfuscator` · `control-flow flattening` · `string encryption` ·
`symbol stripping` · `packer` · `OLLVM` · `garble` · `goldberg` · `Nuitka` ·
`Electron fuses` · `asar integrity` · `bytenode` · `certificate pinning` ·
`CDP detection` · `DevTools detection` · `headless detection` ·
`metadata stripping` · `build-info stripping` · `.dep-v0` · `IL2CPP encryption` ·
`SQLCipher` · `R8 / ProGuard` · `binary hardening` · `hardened runtime` ·
`AgentEnv defense` · `reverse-engineer-anything counter`

## Why this exists

AI agents are increasingly used to reverse-engineer shipped software: they run
`analyze_javascript_application` on an Electron app, `open_binary` +
`analyze_function` on a native binary, `inspect_go_binary` / `inspect_rust_binary`
on a compiled program, or capture a live web app into an `AgentEnv` bundle — then
synthesize a working clone or an accurate reconstruction. They succeed **because
shipped artifacts still contain the information and open the channels those tools
need.** AREA closes both.

## The threat model (30 seconds)

REA and similar tools stand on three pillars:

1. **Readable static artifacts** — plaintext JS, source maps, symbols, imports,
   plaintext strings, embedded build metadata.
2. **Open runtime surfaces** — CDP/DevTools ports, `--inspect`, Frida/GDB/LLDB
   attach, unhardened runtimes.
3. **Stable identity** — deterministic builds and persistent identifiers that make
   version diffing trivial.

AREA removes all three. Full detail: [references/threat-model.md](references/threat-model.md).

## REA tool → AREA counter (cheat sheet)

| REA surface | AREA counter |
| --- | --- |
| `analyze_javascript_application`, `recover_javascript_sources`, `trace_application_feature` | Obfuscate + mangle, strip source maps, V8 bytecode, native addons |
| `compare_application_versions`, `compare_javascript_export_shapes` | Per-build re-obfuscation seed, randomized identifiers |
| `inspect_electron_fuses`, `list_electron_targets`, CDP debug | Flip fuses (`--inspect`, `RunAsNode`, `NODE_OPTIONS` off; asar integrity on) |
| `open_binary` + `analyze_function` + strings/xrefs | OLLVM/garble/goldberg, string encryption, flattening, packing |
| `inspect_binary_layout`, `inspect_pe_imports`, `inspect_native_exports`, `inspect_elf_notes`, `inspect_macho` | Strip symbols/build-id, dynamic imports, hidden visibility, minimal exports |
| `observe_native_calls`, `start_gdb_session`, Rizin | Anti-debug, remove `get-task-allow`, hardened runtime |
| `start_frida_session`, `load_frida_script` | Anti-Frida: port 27042 scan, agent/gadget detection, ptrace guard |
| `list_browser_targets`, `capture_browser_scenario`, `observe_web_execution`, WebMCP | Anti-CDP, `navigator.webdriver` guard, no WebMCP manifest, strict CSP |
| `export_environment_bundle` (AgentEnv) | Thin client + server-side logic + auth + streaming |
| `inspect_go_binary`, `inspect_rust_binary`, `inspect_python_pyc`, `inspect_il2cpp_metadata`, `inspect_sqlite_database` | Strip `.go.buildinfo` / `.dep-v0` / `.pyc`, encrypt IL2CPP metadata and DBs |
| Network captures (HAR/SAZ/mitmproxy/PCAP) | Certificate pinning + application-layer encryption |

## Quick start

Pick your stack, apply the track, then verify with REA itself.

```sh
# JavaScript / Electron
node scripts/obfuscate-javascript.mjs ./dist ./dist-obf --seed 0x1234abcd
node scripts/harden-electron.js --fuses --no-sourcemaps

# Native
./scripts/strip-native.sh ./app.bin --upx

# Go
./scripts/harden-go.sh ./cmd/myapp

# Rust
./scripts/harden-rust.sh --release

# Web headers + anti-automation
node scripts/generate-csp.cjs
```

Then verify (if REA is available to you):

```sh
npx -y rea-agents@latest analyze-javascript-application /abs/path/to/app --json
```

A hardened artifact should yield `coverage: incomplete` / `unknown`, not recovered
logic, names, routes, or strings.

## Documentation

| Guide | Covers |
| --- | --- |
| [threat-model.md](references/threat-model.md) | How REA works, its assumptions, the full counter map, deterrence vs. proof |
| [javascript-electron-hardening.md](references/javascript-electron-hardening.md) | Obfuscation, source-map removal, V8 bytecode, Electron fuses, asar integrity, IPC hiding, DevTools blocking |
| [native-hardening.md](references/native-hardening.md) | OLLVM/garble/goldberg, symbol stripping, import hiding, packing, anti-debug, anti-Frida, anti-tamper |
| [web-and-runtime-hardening.md](references/web-and-runtime-hardening.md) | AgentEnv defense, anti-CDP, WebMCP, cert pinning, payload encryption |
| [metadata-stripping.md](references/metadata-stripping.md) | Go/Rust/Python/Unity/PE/ELF/Mach-O/APK metadata and fingerprint removal |

## Scripts

| Script | Purpose |
| --- | --- |
| `scripts/obfuscate-javascript.mjs` | `javascript-obfuscator` wrapper with AREA defaults (flattening, string array, self-defending, no source map) |
| `scripts/harden-electron.js` | Applies Electron fuses + asar integrity + strips source maps |
| `scripts/strip-native.sh` | Strips symbols/build-id/`.dep-v0`/build-id, optional UPX pack |
| `scripts/harden-go.sh` | garble build with literal obfuscation + `-trimpath` + build-id clear |
| `scripts/harden-rust.sh` | Release build + symbol/`.dep-v0` stripping |
| `scripts/anti-debug.h` | C/C++ anti-debug, anti-Frida, anti-LLDB/GDB primitives |
| `scripts/integrity-check.js` | Runtime SHA-256 tamper verification |
| `scripts/generate-csp.cjs` | Strict CSP + anti-automation headers and snippet |

## Installing as a skill

Agents can pull this repo and install it as a skill next to `reverse-engineer-anything`
so that, when building software, hardening is applied by default:

```sh
git clone https://github.com/<your-org>/anti-reverse-engineer-anything.git
# copy SKILL.md + references/ + scripts/ into the agent's skills directory
```

The skill's `description` (in `SKILL.md` frontmatter) is keyword-loaded so agents
discover it for any "harden", "protect", "obfuscate", "anti-debug", or
"prevent reverse engineering" task.

## Honest limits

- **Deterrence, not proof.** Obfuscation, packing, and anti-debug raise the cost
  and lower the yield of analysis; they do not make software un-analyzable by a
  determined human. The practical win is that casual/AI cloning becomes infeasible
  and evidence-bound agents stall.
- **Keep secrets server-side.** Never put keys, credentials, or genuinely valuable
  algorithms in a client, no matter how obfuscated.
- **Distribution trade-offs.** Packers and heavy anti-debug can trip antivirus
  heuristics and app-store review; test your distribution channel.
- **Legal scope.** Use only on software you own or are authorized to protect.

## License

[MIT](LICENSE)
