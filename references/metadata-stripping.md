# Metadata & fingerprint stripping

REA has a large family of **declarative-metadata parsers** — they don't analyze
code, they read build-time fingerprints you embedded. Every one below has a
specific, cheap counter. Strip these and the agent's fingerprinting pass returns
`null` metadata instead of a dependency/manifest inventory.

## Go binaries (`inspect_go_binary`)

`inspect_go_binary` reads the embedded compiler version, module/dependency list,
and build settings from `.go.buildinfo`.

Counter:

```sh
# garble with literal obfuscation + tiny (see native-hardening.md)
garble -literals -tiny -seed=random build -trimpath \
  -ldflags="-s -w -buildid=" -buildvcs=false ./...

# then remove the build-info section outright
go tool buildid -w ./binary   # clears build id
```

Use `-trimpath` to remove absolute source paths (which leak your username/home
structure and CI layout). `-buildvcs=false` stops VCS stamping. Stripping
`.go.buildinfo` (via `strip` or post-processing) removes the module list entirely
so the agent can't enumerate your dependency versions.

## Rust binaries (`inspect_rust_binary`)

`inspect_rust_binary` reads the `.dep-v0` section that `cargo-auditable` embeds —
a full crate/version manifest.

Counter: **don't ship cargo-auditable metadata**, and strip it if a dependency
dragged it in:

```sh
strip -R .dep-v0 ./binary            # ELF
# or objcopy --remove-section=.dep-v0 ./binary
```

Also compile with `strip = "symbols"`, `debug = false`, and use `goldberg` for
string obfuscation. Without `.dep-v0`, `inspect_rust_binary` reports null
metadata — no dependency enumeration.

## ELF notes / build-id (`inspect_elf_notes`)

Build-ids and notes leak compiler/ABI info and give REA a stable identity.

```sh
strip -R .note.gnu.build-id ./binary
# also: objcopy --remove-section=.note.ABI-tag ./binary
```

## PE tables

- **`inspect_pe_imports`** (import/delay-load tables) → resolve APIs dynamically
  (see native-hardening.md). A minimal import table reveals little.
- **`inspect_native_exports`** → hide visibility; export only the entry.
- **`inspect_pe_load_config`** (TLS callbacks, security cookie, CFG) → avoid TLS
  callbacks; move init into `main`. CFG/cookie declarations are just metadata, but
  fewer directories = fewer facts.
- **`inspect_pe_resources`** → don't embed raw config/keys as resources; load them
  encrypted at runtime.
- **`inspect_pe_certificates`** → keep your Authenticode cert (removing it breaks
  Windows trust), but be aware the cert exposes your signing identity. Nothing to
  strip here — the counter is operational (don't reuse a personal cert; use a
  dedicated org cert).

## Mach-O (`inspect_macho`)

Strip symbols and reduce exports (`strip -S -x`, `-fvisibility=hidden`). Remove
the UUID if your distribution allows (note: the UUID is used for crash
symbolication and App Store validation — weigh this).

## Python (`inspect_python_pyc`)

`inspect_python_pyc` reads CPython bytecode headers. **Never ship `.pyc` or `.py`**
for closed-source Python:

- Compile to a native binary with [Nuitka](https://nuitka.net) or Cython — there
  is then no `.pyc` to inspect.
- If you must ship Python, obfuscate with PyArmor (encrypts bytecode) and strip
  `.pyc` headers.

## Unity / IL2CPP (`inspect_il2cpp_metadata`)

`inspect_il2cpp_metadata` reads `global-metadata.dat` — all type/method/string
names. Its own docs note *"unrecognized magic (possibly encrypted) is unsupported."*

Counter: encrypt `global-metadata.dat` and decrypt it in a native loader at
startup. The agent then hits the unsupported-magic path and recovers nothing.

## Databases (`inspect_sqlite_database`)

Ship **no plaintext SQLite**. Encrypt with SQLCipher (or equivalent) and derive
the key from the user's credential / hardware at runtime. `inspect_sqlite_database`
then sees an encrypted blob, not your schema or seed data. Keep the schema itself
out of any shipped sample; never ship a database that contains real user data or
secrets.

## Android / APK

`inspect_android_package` / `inspect_apk_signature` read classes, methods, and
signing. Counter with the standard Android toolchain:

- R8/ProGuard minify + obfuscate (and `-dontwarn` only where safe).
- String encryption via a plugin (e.g. StringFog) or your own XOR/RC4 literals.
- Consider DexGuard (commercial) for control-flow flattening.
- Split sensitive logic into native `.so` (NDK) hardened per native-hardening.md.

## Source maps (universal)

`analyze_javascript_application` treats source maps as first-class evidence for
original names/paths. This is the single most important leak in the whole map.
**Never ship `.map` files or `sourceMappingURL` comments in production**, across
every framework (webpack `devtool: false`, Vite `build.sourcemap: false`, Next
`productionBrowserSourceMaps: false`, etc.).

## Build paths (`-trimpath`, `-grecord-gcc-switches`)

Absolute paths embedded via debug info leak your machine's username, home layout,
and CI structure. Use `-trimpath` (Go), `-ffile-prefix-map=old=new` (GCC/Clang),
and disable `-grecord-gcc-switches`. These make REA's path/fingerprint recovery
return meaningless or absent locations.

## Checklist

- [ ] No source maps / `sourceMappingURL` in any shipped bundle.
- [ ] `.go.buildinfo` and build-id stripped (Go).
- [ ] `.dep-v0` stripped (Rust).
- [ ] Symbols, build-id, `.note.*` stripped (native).
- [ ] Import/export tables minimized; dynamic resolution.
- [ ] No `.pyc` shipped; Python compiled to native.
- [ ] `global-metadata.dat` encrypted (Unity).
- [ ] Databases encrypted, no plaintext schema shipped.
- [ ] `-trimpath` / file-prefix-map to kill absolute paths.
