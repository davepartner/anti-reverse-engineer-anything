# Native hardening (C / C++ / Objective-C / Rust / Go)

Counter the native path of REA: `open_binary`, `binary_overview`,
`analyze_function`, `list_procedures`, pseudocode, `search_strings`, `xrefs`,
`inspect_binary_layout`, `inspect_pe_imports`, `inspect_native_exports`,
`inspect_elf_notes`, `inspect_macho`, `observe_native_calls` (LLDB),
`start_gdb_session`, `start_frida_session`.

Apply **all** of the passive layers. Add active detection as a removable second layer.

## 1. Compiler obfuscation (passive, highest value)

Obfuscating at the compiler/linker level breaks `analyze_function` pseudocode and
`search_strings` far more effectively than source-level tricks.

### C / C++ / Objective-C: OLLVM

Use an [OLLVM](https://github.com/obfuscator-llvm/obfuscator) toolchain (or the
maintained forks: `plutoboy`'s, `heroims/obfuscator`, or `blackarch`'s) with:

- **Control-flow flattening** (`-mllvm -fla`) — turns every function into a
  dispatcher loop; pseudocode becomes unreadable.
- **Bogus control flow** (`-mllvm -bcf`) — injects opaque predicates.
- **Instruction substitution** (`-mllvm -sub`) — replaces arithmetic with
  equivalent-but-obscure sequences.
- **String obfuscation** (`-mllvm -sobf`) — encrypts string literals; REA's
  `search_strings` then finds only the decryptor.

```sh
clang -mllvm -fla -mllvm -bcf -mllvm -sub -mllvm -sobf \
      -o app.app/Contents/MacOS/app main.c
```

Also consider [Hikari](https://github.com/HikariObfuscator/Hikari) (the OLLVM fork
kept current for Apple platforms).

### Rust: `cargo +nightly build -Z build-std` + obfuscation

- Compile in release with `strip = "symbols"`, `debug = false`, `lto = "fat"`,
  `codegen-units = 1`, `opt-level = "z"` (or `3`), `panic = "abort"`.
- Use [goldberg](https://github.com/friedkeenan/goldberg) for string obfuscation.
- Obfuscate control flow with the `ollvm` LLVM backend for the `-Z build-std` path.

### Go: garble

Use [garble](https://github.com/burrowers/garble) (see `scripts/harden-go.sh`):

```sh
garble -literals -tiny -seed=random build -trimpath \
  -ldflags="-s -w -buildid=" -buildvcs=false ./...
```

`-literals` encrypts string literals, `-tiny` removes debug/position info,
`-seed=random` makes each build unique.

## 2. Strip symbols and debug info (passive)

REA's `inspect_binary_layout`, `inspect_elf_notes`, and `inspect_macho` enumerate
symbols, build-ids, and section names. Remove them:

```sh
# macOS / Linux (strip)
strip -S -x -s ./binary            # all symbols
strip -R .note.gnu.build-id ./binary   # remove GNU build-id (Linux)

# macOS: also remove export info you don't need
strip -S -x app.app/Contents/MacOS/app
```

- **Never ship** `.pdb` (Windows), `dSYM` (macOS), or unstripped ELF debug sections.
- Disable `-g` / debug info in release builds.
- For Rust, set `strip = "symbols"` and do **not** use `cargo-auditable` on the
  shipping build (see metadata-stripping.md).

## 3. Obfuscate import/export tables (passive)

`inspect_pe_imports` and `inspect_native_exports` read the static tables. Deny them:

- **Dynamic import resolution**: replace `GetProcAddress`/`dlsym`-resolvable names
  with hash-based lookups. Store only FNV-1a/ROR-13 hashes of API names; resolve at
  runtime. The import table then lists almost nothing.
- **Minimize exports**: mark functions `static`, use `-fvisibility=hidden`, or a
  linker version script / `-exported_symbols_list` to expose only the single entry
  point (or none for a library you control both sides of).
- **Delay-load trick**: for Windows, resolve the *minimum* via delay-load and the
  rest manually.

```sh
# GCC/Clang: hide all symbols except the entry
clang -fvisibility=hidden -Wl,-exported_symbol,_main -o app main.c
```

## 4. String encryption (passive)

Plaintext strings feed `search_strings`, `list_names`, and
`analyze_javascript_application` string seeds. Encrypt them:

- OLLVM `-sobf` / goldberg / garble `-literals` (above), or
- a small runtime macro that XOR/RC4-decrypts literals on first use.

```c
#define SEC(str) (decrypt(str, sizeof(str) - 1, KEY))
```

The decryptor becomes the only recoverable artifact, and each string must be
individually recovered at runtime.

## 5. Packing (passive)

A packer compresses/encrypts the real code and unpacks at load. REA's own guidance
admits *"decompiling an unpacking stub does not recover the unpacked program."*

- UPX (weakest, trivially unpackable — use only as a cheap first layer).
- Stronger: VMProtect, Themida (commercial), or a custom stub that decrypts a
  section with a key derived from hardware/entitlements.

Keep in mind: packing can trip antivirus heuristics and app-store review. Apply it
to the parts that matter, not blanket, and test distribution.

## 6. Anti-debugging (active, removable)

`observe_native_calls` launches under LLDB; `start_gdb_session`/Rizin attach.
Detect and refuse to run.

### macOS

```c
#include <sys/types.h>
#include <sys/sysctl.h>
#include <unistd.h>
#include <ptrace.h>

int am_i_debugged(void) {
    int mib[4] = { CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid() };
    struct kinfo_proc info; size_t sz = sizeof(info);
    if (sysctl(mib, 4, &info, &sz, NULL, 0) == 0)
        if ((info.kp_proc.p_flag & P_TRACED) != 0) return 1;
    return 0;
}

void deny_attach(void) {
    // PT_DENY_ATTACH — prevents LLDB from attaching (non-hardened processes).
    ptrace(PT_DENY_ATTACH, 0, 0, 0);
}
```

### Linux

```c
#include <sys/ptrace.h>
#include <stdio.h>
// Self-attach: if it fails, a tracer already holds us.
if (ptrace(PTRACE_TRACEME, 0, 0, 0) == -1) _exit(1);
// Later: read /proc/self/status "TracerPid" and refuse if non-zero.
```

### Windows

```c
// PEB->BeingDebugged and NtGlobalFlag checks; also IsDebuggerPresent().
if (IsDebuggerPresent()) _exit(1);
```

### Hardened runtime (macOS) — the LLDB killer

`observe_native_calls` on hardened-runtime targets needs the `get-task-allow`
entitlement. For a release build, ship **hardened runtime WITHOUT `get-task-allow`**:

- Enable Hardened Runtime + Library Validation in Xcode.
- Sign with `codesign --options runtime --entitlements` that **exclude**
  `com.apple.security.get-task-allow` (debug builds may include it; release must not).
- Then LLDB cannot attach without your signing identity.

## 7. Anti-Frida (active, removable)

Frida injects `frida-agent`/`frida-gadget` and runs a server on TCP 27042 by default.

```c
#include <stdint.h>

// 1. Scan for frida-server's default port (27042) on localhost.
// 2. Scan own memory/loaded libraries for "frida" / "gadget" / "LIBFRIDA".
// 3. On Linux, detect the Frida agent by the "gmain" thread or /proc/self/maps
//    entries containing "frida-agent" or "gadget".
// 4. Combine with the ptrace TracerPid check — Frida needs to ptrace to spawn.
```

Keep these checks **spread out and de-synchronized** (call them from a background
thread at irregular intervals, not a single obvious `if` at startup), otherwise the
analyst patches one branch.

## 8. Anti-tamper integrity checks (active)

Verify the signed image at runtime so a patched binary refuses to run:

- Hash your `.text` (and the packed payload) at startup and compare against a
  value signed into the binary; bail (silently, after a delay) on mismatch.
- Use code-signing APIs (`SecCodeCopySelf` / `SecStaticCodeCheckValidity` on macOS,
  `WinVerifyTrust` on Windows) to verify the running image is still signed by you.

Do **not** make the check trivially removable: derive the expected hash at build
time, scatter the check, and compare through an obfuscated transform.

## 9. Use `scripts/strip-native.sh`

```sh
./scripts/strip-native.sh ./path/to/binary [--upx]
```

Applies symbol stripping, build-id/section removal, and optionally UPX packing.
Then verify with REA: `open_binary` + `analyze_function` should return no useful
pseudocode, and `search_strings` should return only the decryptor.

## Summary of the ideal native build

1. OLLVM/garble/goldberg with flattening + string encryption.
2. `strip -S -x -s`, no build-id, no `.pdb`/`dSYM`.
3. Hidden visibility, dynamic import resolution, minimal exports.
4. Packer or section encryption.
5. Anti-debug + anti-Frida + anti-tamper (active, scattered).
6. Hardened runtime, no `get-task-allow`, signed + notarized.
