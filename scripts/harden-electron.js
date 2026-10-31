#!/usr/bin/env node
/**
 * AREA — Electron hardening.
 *
 * Flips Electron fuses against REA's inspect_electron_fuses / list_electron_targets,
 * enables asar integrity, and strips stray sourceMappingURL / .map references.
 *
 * Usage (run in the project root, after electron-builder has produced dist/):
 *   node scripts/harden-electron.js --fuses --no-sourcemaps
 *   node scripts/harden-electron.js --asar-integrity ./release/**\/*.asar
 *
 * Fuses are applied at *packaging* time via the @electron/fuses `flipFuses`
 * API. Point the script at your packaged app's executable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const wantsFuses = argv.includes('--fuses');
const wantsNoSourcemaps = argv.includes('--no-sourcemaps');

function findExecutable(appDir) {
  // Look for the common packaged entry points.
  const candidates = [
    path.join(appDir, 'Contents', 'MacOS'),
    path.join(appDir, 'resources'),
  ];
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      // mac: executable inside Contents/MacOS; win/linux: the .exe / binary
      if (st.isFile() && !name.startsWith('.') && (
        name.endsWith('.exe') || dir.endsWith(path.join('Contents', 'MacOS')))) {
        return p;
      }
    }
  }
  return null;
}

async function applyFuses() {
  const electronFuses = await import('@electron/fuses').catch(() => null);
  if (!electronFuses) {
    console.error('[@electron/fuses] not installed. Add it as a devDependency and rerun.');
    process.exit(1);
  }
  const { flipFuses, FuseVersion, FuseV1Options } = electronFuses;

  const exe = findExecutable(process.cwd()) || findExecutable(path.join(process.cwd(), 'release'));
  if (!exe) {
    console.error('No packaged Electron executable found. Pass its path: node harden-electron.js <path-to-app-exe>');
    process.exit(1);
  }

  const extra = {
    [FuseV1Options.EnableNodeCliInspectArguments]: false,        // ignore --inspect
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false, // ignore NODE_OPTIONS
    [FuseV1Options.RunAsNode]: false,                            // block ELECTRON_RUN_AS_NODE
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true, // detect tampered app.asar
    [FuseV1Options.EnableCookieEncryption]: true,                // encrypt cookies on disk
    [FuseV1Options.OnlyLoadAppFromAsar]: true,                   // refuse to load app from plain dir
  };

  await flipFuses(exe, {
    version: FuseVersion.V1,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });
  console.log(`Fuses applied to ${exe}`);
}

function stripSourcemaps(root) {
  let count = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.map')) { fs.unlinkSync(p); count++; }
      else if (entry.name.endsWith('.js')) {
        let s = fs.readFileSync(p, 'utf8');
        const before = s;
        s = s.replace(/\n?\/\/[#@] sourceMappingURL=.*$/m, '')
             .replace(/\n?\/\*[#@] sourceMappingURL=.*?\*\//g, '');
        if (s !== before) { fs.writeFileSync(p, s); count++; }
      }
    }
  };
  const root = process.cwd();
  walk(root);
  console.log(`Stripped ${count} source-map artifact(s) under ${root}`);
}

if (wantsFuses) await applyFuses();
if (wantsNoSourcemaps) stripSourcemaps();
if (!wantsFuses && !wantsNoSourcemaps) {
  console.log('Usage: node harden-electron.js [--fuses] [--no-sourcemaps]');
}
