#!/usr/bin/env node
/**
 * AREA — CSP + anti-automation header generator.
 *
 * Emits a strict Content-Security-Policy and companion security headers that
 * reduce the surface REA's CDP/automation tooling can use, plus a minimal
 * in-page anti-automation snippet.
 *
 * Usage:
 *   node scripts/generate-csp.cjs              # prints headers + snippet
 *   node scripts/generate-csp.cjs --json       # JSON for a framework config
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'nonce-$NONCE'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' https:",
  "font-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const headers = {
  'Content-Security-Policy': csp,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

const snippet = `// AREA anti-automation guard (obfuscate before shipping)
(function () {
  try {
    var auto =
      (navigator.webdriver === true) ||
      /HeadlessChrome/i.test(navigator.userAgent || '') ||
      (navigator.plugins && navigator.plugins.length === 0);
    var dOpen = false;
    var t = 0;
    if (window.outerWidth - window.innerWidth > 100) dOpen = true;
    try { t = performance.now(); debugger; if (performance.now() - t > 50) dOpen = true; } catch (e) {}
    if (auto || dOpen) {
      // degrade: serve neutral content instead of the real app
      window.__AREA_HARDENED__ = true;
    }
  } catch (e) {}
})();`;

const asJson = process.argv.includes('--json');
if (asJson) {
  console.log(JSON.stringify({ headers, snippet }, null, 2));
} else {
  console.log('# Security headers');
  for (const [k, v] of Object.entries(headers)) console.log(`${k}: ${v}`);
  console.log('\n# Anti-automation snippet');
  console.log(snippet);
}
