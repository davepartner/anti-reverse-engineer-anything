#!/usr/bin/env node
/**
 * AREA — runtime integrity check (Electron / Node).
 *
 * Verifies the shipped app.asar (or a supplied file) against an expected
 * SHA-256 at startup, so a tampered/patched bundle refuses to run. REA's
 * extract_artifact / tampering attempts produce a mismatch and the app bails.
 *
 * Usage:
 *   node scripts/integrity-check.js <path> <expected-sha256-hex>
 *
 * In your app, compute the expected hash at build time and embed it, then
 * call this (or inline the check) early in the main process.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const [file, expected] = process.argv.slice(2);
if (!file || !expected) {
  console.error('Usage: node integrity-check.js <path> <expected-sha256-hex>');
  process.exit(2);
}

const abs = path.resolve(file);
if (!fs.existsSync(abs)) {
  console.error(`Missing: ${abs}`);
  process.exit(3);
}

const hash = crypto.createHash('sha256');
for (const chunk of readStream(abs)) {
  hash.update(chunk);
}
const actual = hash.digest('hex');

const ok = actual.toLowerCase() === expected.toLowerCase();
console.log(`${ok ? 'OK' : 'MISMATCH'}  ${path.basename(abs)}  sha256=${actual}`);
process.exit(ok ? 0 : 1);

function* readStream(p) {
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(1 << 20);
  let n;
  try {
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      yield buf.subarray(0, n);
    }
  } finally {
    fs.closeSync(fd);
  }
}
