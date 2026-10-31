# Web app & runtime hardening

Counter the runtime/observation path of REA: `list_browser_targets`,
`capture_browser_scenario`, `observe_web_execution`, `inspect_web_event_listeners`,
`discover_webmcp_tools`, `export_environment_bundle` (AgentEnv), and network
capture (HAR / SAZ / mitmproxy / PCAP).

## 1. The clone threat: AgentEnv bundles

`export_environment_bundle` records a live web app and writes an "AgentEnv"
bundle — a static reconstruction of your client that an agent can re-host and
study. The only robust defense is architectural:

**Make the client a thin shell.** Move the product's actual value — the
algorithm, the pricing logic, the data transforms — **server-side**. A captured
client then reconstructs a login form and a spinner, not the product.

Concretely:

- Render the interesting state from a server API; never compute the secret logic
  client-side.
- Require authenticated sessions for any meaningful view; unauthenticated
  captures show only a shell.
- Stream state over WebSocket/SSE rather than embedding it in static HTML, so a
  point-in-time capture misses the dynamic behavior.

If the client must contain logic, obfuscate it (see
javascript-electron-hardening.md) and keep the crown jewels server-side.

## 2. Anti-CDP / anti-automation

REA drives the page through the Chrome DevTools Protocol. Detect and degrade:

```js
// automation signals
const automated =
  navigator.webdriver === true ||
  navigator.userAgent.includes('HeadlessChrome') ||
  !navigator.plugins.length ||
  window.chrome && !window.chrome.runtime;

// DevTools-open heuristic (width delta) + debugger-statement timing check
const devtoolsOpen = () => {
  const w = window.outerWidth - window.innerWidth;
  if (w > 100) return true;
  const start = performance.now();
  /* eslint-disable no-debugger */
  debugger;
  return performance.now() - start > 50;
};
```

When automation or DevTools is suspected: serve a degraded, non-functional view,
throttle, or require a CAPTCHA for the real path. Never hard-fail loudly with an
obvious "you are being watched" banner — that just tells the analyst which branch
to patch.

## 3. Declare no WebMCP tools

REA's `discover_webmcp_tools` inventories page-declared WebMCP tools (it never
invokes them, but lists them as attack surface). Ship **no** `window.webmcp` /
WebMCP manifest in production. If you use WebMCP internally, gate it behind a
build flag so the production bundle declares nothing.

## 4. Harden the event/listener surface

`inspect_web_event_listeners` maps listener source locations. Keep the exposed
surface small:

- Bind listeners to a single, obfuscated entry module.
- Avoid inline `onclick=`/`on*=` attributes (trivially enumerable).
- Use event delegation through one root handler where possible.

## 5. Network: pinning + payload encryption

REA reads captured traffic (HAR/SAZ/mitmproxy/PCAP) to learn your API shape.

- **Certificate pinning**: pin your leaf/intermediate certs (or at least a
  hash of the SPKI) so a MITM proxy's injected CA is rejected. In Electron, use
  `session.setCertificateVerifyProc`; on the web, pin only where you control both
  ends (native apps), since web pins are brittle.
- **Application-layer encryption**: encrypt the sensitive request/response bodies
  (e.g. a libsodium/NaCl box sealed to an ephemeral key) inside TLS. A captured
  `POST /api/score` then shows a ciphertext blob, not your payload schema.
- **TLS hygiene**: force TLS 1.3, disable weak ciphers, keep SNI as opaque as you
  can (see your CDN/encrypted-SNI options).

For native apps, also pin the server certificate so Fiddler/Charles/Everywhere
MITM fails closed.

## 6. Runtime process observation (native companion)

If your app has a native shell, `capture_process_scenario` observes stdout/files.
Do not log secrets, keys, tokens, or internal state to stdout; write encrypted
config, not plaintext; and don't emit deterministic progress output that reveals
logic.

## 7. Server-side rate limits & anomalies

A REA-driven agent will probe endpoints. Server-side, add rate limiting and
anomaly detection (unusual UA, missing referrer, burst of enumeration-like calls)
so the *server* can refuse an analyst without the client knowing why.

## 8. Summary

| Channel | Defense |
| --- | --- |
| AgentEnv clone | Thin client, server-side logic, auth + streaming |
| CDP / DevTools | Kill remote debugging, detect automation, degrade |
| WebMCP discovery | Ship no WebMCP manifest |
| Event/listener mapping | Delegate, obfuscate, avoid inline handlers |
| MITM capture | Cert pinning + app-layer encryption |
| Process capture | No secrets in stdout/files |
| Enumeration probing | Server-side rate limits + anomaly detection |
