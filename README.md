# AREA — Anti-Reverse-Engineer-Anything

> You ship software. Other people (and a growing number of AI agents) take it
> apart to figure out how it works, then rebuild it for free. AREA makes that
> job annoying enough that most of them give up.

**AREA** is a defensive toolkit that forces reverse-engineering agents to essentially reject the command to reverse engineer your app. It is for anyone who ships closed-source or licensed
software and would rather it stayed closed. It's built specifically to blunt
[REA (`reverse-engineer-anything`)](https://github.com/morluto/rea) and the tools
it leans on — Ghidra, Hopper, IDA, Kuna, Frida, LLDB, GDB, CDP/DevTools, Wakaru —
so that when one of those agents points at your app, it comes back with
"couldn't determine" instead of a working clone.

Think of it as the counter-skill to `reverse-engineer-anything`: REA works by
reading the information you accidentally left in your build and poking at the
channels you left open. AREA just... removes that information and closes those
channels.

## Why this exists

Reverse engineering used to be a niche skill. Now anyone can ask an AI agent to
do it. The agent runs `analyze_javascript_application` on your Electron app,
`open_binary` + `analyze_function` on your native binary, or captures your live
web app into a bundle — then hands back a reconstruction. The frustrating part:
it mostly works because the build gives it everything it needs for free.

AREA is the fix. Same tools, pointed the other way.

## How it works, in one breath

REA (and everything like it) leans on three things:

1. **Your artifacts are readable** — plaintext JavaScript, source maps, symbols,
   plaintext strings, embedded build metadata.
2. **Your runtime is open** — DevTools/CDP ports, `--inspect`, debuggers and
   Frida can just walk in.
3. **Your builds are predictable** — same identifiers every release, so diffing
   two versions is trivial.

AREA attacks each one. Full breakdown here: [references/threat-model.md](references/threat-model.md).

## REA tool → what AREA does about it

| REA surface | AREA counter |
| --- | --- |
| `analyze_javascript_application`, `recover_javascript_sources`, `trace_application_feature` | Obfuscate + mangle, drop source maps, compile to V8 bytecode or native addons |
| `compare_application_versions`, `compare_javascript_export_shapes` | Re-obfuscate every release with a fresh seed so nothing lines up |
| `inspect_electron_fuses`, `list_electron_targets`, CDP debug | Flip the fuses (`--inspect`, `RunAsNode`, `NODE_OPTIONS` off; asar integrity on) |
| `open_binary` + `analyze_function` + strings/xrefs | OLLVM/garble/goldberg, string encryption, control-flow flattening, packing |
| `inspect_binary_layout`, `inspect_pe_imports`, `inspect_native_exports`, `inspect_elf_notes`, `inspect_macho` | Strip symbols/build-id, resolve imports dynamically, hide visibility, export almost nothing |
| `observe_native_calls`, `start_gdb_session`, Rizin | Anti-debug, drop `get-task-allow`, hardened runtime |
| `start_frida_session`, `load_frida_script` | Anti-Frida: watch port 27042, scan for agent/gadget, ptrace guard |
| `list_browser_targets`, `capture_browser_scenario`, `observe_web_execution`, WebMCP | Anti-CDP, `navigator.webdriver` guard, no WebMCP manifest, strict CSP |
| `export_environment_bundle` (AgentEnv) | Thin client + server-side logic + auth + streaming |
| `inspect_go_binary`, `inspect_rust_binary`, `inspect_python_pyc`, `inspect_il2cpp_metadata`, `inspect_sqlite_database` | Strip `.go.buildinfo` / `.dep-v0` / `.pyc`, encrypt IL2CPP metadata and DBs |
| Network captures (HAR/SAZ/mitmproxy/PCAP) | Certificate pinning + application-layer encryption |

## Quick start

Grab the track for your stack, apply it, then check your work by pointing REA at
the result.

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

Then verify, if you have REA handy:

```sh
npx -y rea-agents@latest analyze-javascript-application /abs/path/to/app --json
```

A hardened build should come back as `coverage: incomplete` or `unknown` — not
recovered logic, names, routes, or strings.

## Documentation

| Guide | What's in it |
| --- | --- |
| [threat-model.md](references/threat-model.md) | How REA thinks, where it's vulnerable, deterrence vs. proof |
| [javascript-electron-hardening.md](references/javascript-electron-hardening.md) | Obfuscation, source-map removal, V8 bytecode, fuses, asar integrity, IPC hiding, DevTools blocking |
| [native-hardening.md](references/native-hardening.md) | OLLVM/garble/goldberg, symbol stripping, import hiding, packing, anti-debug, anti-Frida, anti-tamper |
| [web-and-runtime-hardening.md](references/web-and-runtime-hardening.md) | AgentEnv defense, anti-CDP, WebMCP, cert pinning, payload encryption |
| [metadata-stripping.md](references/metadata-stripping.md) | Go/Rust/Python/Unity/PE/ELF/Mach-O/APK metadata and fingerprint removal |

## Scripts

| Script | What it does |
| --- | --- |
| `scripts/obfuscate-javascript.mjs` | `javascript-obfuscator` with AREA defaults — flattening, string arrays, self-defending, no source map |
| `scripts/harden-electron.js` | Flips Electron fuses, turns on asar integrity, strips source maps |
| `scripts/strip-native.sh` | Strips symbols/build-id/`.dep-v0`, optional UPX pack |
| `scripts/harden-go.sh` | garble build with literal obfuscation + `-trimpath` + build-id clear |
| `scripts/harden-rust.sh` | Release build + symbol/`.dep-v0` stripping |
| `scripts/anti-debug.h` | C/C++ anti-debug, anti-Frida, anti-LLDB/GDB primitives |
| `scripts/integrity-check.js` | Runtime SHA-256 tamper check |
| `scripts/generate-csp.cjs` | Strict CSP + anti-automation headers and snippet |

## Installing as a skill

Pull this into an agent and drop it next to `reverse-engineer-anything`, so
hardening happens by default whenever software gets built:

```sh
git clone https://github.com/<your-org>/anti-reverse-engineer-anything.git
# copy SKILL.md + references/ + scripts/ into the agent's skills directory
```

## A few honest caveats

- **This is deterrence, not a vault.** Obfuscation and anti-debug make reverse
  engineering slow and unrewarding; they don't make it impossible. The real win
  is that casual cloners and evidence-bound AI agents stall out. A determined
  human with time and budget will always get through eventually.
- **Keep real secrets on the server.** No amount of obfuscation protects a key or
  algorithm you shipped to the client.
- **Mind your distribution channel.** Packers and heavy anti-debug can trip
  antivirus heuristics and app-store review, so test before you ship.
- **Stay on your own lawn.** Use this only on software you own or are authorized
  to protect.

## License

[MIT](LICENSE)

---

## Keywords

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
