# JavaScript & Electron hardening

Counter the JavaScript/Electron path of REA: `analyze_javascript_application`,
`recover_javascript_sources`, `trace_application_feature`,
`compare_application_versions`, `compare_javascript_export_shapes`,
`inspect_electron_fuses`, `list_electron_targets`, and CDP-based observation.

REA's JS analysis is unusually powerful **because you ship readable source and
source maps**. Remove those two things and its module graph, route inventory,
IPC pairing, and feature tracing all collapse to `unknown`.

## 1. Obfuscate (passive, non-negotiable)

Minification is *not* obfuscation — REA's `recover_javascript_sources` (Wakaru)
exists precisely to de-minify readable bundles. Use a real obfuscator with the
transforms Wakaru cannot invert.

Use [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator)
via `scripts/obfuscate-javascript.mjs`:

```sh
node scripts/obfuscate-javascript.mjs ./dist ./dist-obfuscated
```

The AREA defaults enable:

- `stringArray` + `stringArrayEncoding: "rc4"` + `rotateStringArray` — encrypts
  every literal, killing route/IPC/string seeds REA relies on.
- `controlFlowFlattening` — Wakaru cannot flatten; `trace_application_feature`
  and de-obfuscation stall.
- `deadCodeInjection` — injects bogus branches that poison the module graph.
- `identifierNamesGenerator: "hexadecimal"` + `renameGlobals` — destroys stable
  identifiers, breaking `compare_application_versions` and export-shape diffing.
- `selfDefending` — makes manual de-obfuscation harder.
- `splitStrings` + `transformObjectKeys`.

**Do not ship the source map** (`sourceMap: false`, and strip any
`//# sourceMappingURL=`). REA explicitly consumes source maps to recover original
names and paths — it is the single highest-leverage leak to close.

## 2. Compile JS out of plaintext (passive, highest value)

Obfuscated JS is still JS. For the modules that hold real logic, ship **no JS
source at all**:

- **V8 bytecode** via [bytenode](https://github.com/bytenode/bytenode): compile
  `.js` to `.jsc`. `analyze_javascript_application` sees bytecode blobs, not
  source — no module graph, no literals, no routes.
- **Native addons** (N-API / `node-addon-api`): move critical algorithms into a
  compiled `.node` binary (which you then harden per native-hardening.md).
- **WebAssembly** for hot numeric logic (and obfuscate the WASM).

Hybrid is best: an obfuscated JS shell that calls bytecode/native for anything
secret.

## 3. Kill the static IPC channel map

REA pairs IPC channels only on a **unique exact literal** match
(`ipcMain.on("literal", ...)`). If the channel name is computed at runtime, the
static pairing fails and the channel is reported `unresolved`.

```js
// instead of: ipcMain.on("app:get-secret", ...)
const channel = deriveChannel("app:get-secret", sessionNonce); // hash + nonce
ipcMain.on(channel, handler);
```

Even simpler: derive the channel from a constant XOR'd at runtime so the literal
`"app:get-secret"` never appears in the bundle.

## 4. Electron fuses (passive, cheap)

`inspect_electron_fuses` reads the fuses REA would use to establish debugging is
possible. Flip them against it:

| Fuse | Set to | Why |
| --- | --- | --- |
| `EnableNodeCliInspectArguments` | **disabled** | App ignores `--inspect`; blocks `list_electron_targets` debugging |
| `EnableNodeOptionsEnvironmentVariable` | **disabled** | Blocks `NODE_OPTIONS=--inspect` injection |
| `RunAsNode` | **disabled** | Prevents running `ELECTRON_RUN_AS_NODE` to dump code |
| `EnableEmbeddedAsarIntegrityValidation` | **enabled** | Detects tampered `app.asar` at load |
| `EnableCookieEncryption` | **enabled** | Encrypts cookies on disk |

Apply via `@electron/fuses` — `scripts/harden-electron.js` does this.

## 5. asar integrity + encryption

- Enable **asar integrity** (`electron-builder` `asarIntegrity`) so REA can't
  quietly swap files.
- Encrypt individual files inside the asar; decrypt in the preload at runtime so
  an extracted asar contains ciphertext, not source.
- For the truly sensitive files, keep them **out of the asar** and decrypt them
  from a signed blob at first run.

## 6. Disable DevTools / remote debugging (active)

REA observes renderer/main through CDP. Close it:

```js
// main process
app.on('web-contents-created', (_e, contents) => {
  contents.on('before-input-event', (e) => {
    // block the DevTools shortcuts if you need it locked down
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

new BrowserWindow({
  devTools: false,            // no DevTools in production
  webPreferences: {
    devTools: false,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
  },
});

// refuse a remote debugging port
if (process.argv.some(a => a.startsWith('--remote-debugging-port') ||
                          a.startsWith('--inspect'))) {
  app.quit();
}
```

Also detect an open DevTools at runtime (window-size heuristic + a
`debugger`-statement timing check in the renderer) and refuse to continue the
sensitive path.

## 7. Detect headless/automation in renderer

A REA `capture_browser_scenario` launch is a real Chromium, but instrumented:

```js
if (navigator.webdriver) { /* automated — degrade */ }
```

Combine with `window.outerWidth - window.innerWidth` checks, missing
`navigator.plugins`, and `chrome.app` absence. When automation is suspected,
serve a degraded/neutral view instead of the real app.

## 8. Preload / contextBridge hygiene

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Expose a **minimal** typed API through `contextBridge`; never expose `ipcRenderer`
  raw or `require`. REA's preload/contextBridge surface analysis then finds a
  tiny, uninteresting surface.

## 9. Version-diff resistance

`compare_application_versions` and `compare_javascript_export_shapes` diff two
builds by stable identifiers and digest. To make diffs meaningless:

- Re-obfuscate each release with a **fresh random seed** (`--seed`/random salt) so
  identifiers and string-array ordering differ globally, not just where logic changed.
- Keep `renameGlobals` on so cross-version names never line up.

Two releases then share almost no stable identity, and a diff reports noise, not
"what changed."

## 10. Apply `scripts/harden-electron.js`

```sh
node scripts/harden-electron.js --fuses --asar-integrity --no-sourcemaps
```

This flips the fuses, enables asar integrity, and strips any stray
`sourceMappingURL` / `.map` references from the build output.
