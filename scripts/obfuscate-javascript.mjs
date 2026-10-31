#!/usr/bin/env node
/**
 * AREA — JavaScript obfuscation wrapper.
 *
 * Applies javascript-obfuscator with AREA defaults tuned to defeat
 * REA's analyze_javascript_application / recover_javascript_sources /
 * trace_application_feature / compare_application_versions.
 *
 * Usage:
 *   node scripts/obfuscate-javascript.mjs <input-dir-or-file> [output-dir]
 *   node scripts/obfuscate-javascript.mjs ./dist ./dist-obf --seed 0x1234abcd
 *
 * Options via flags:
 *   --seed <n>          deterministic seed (omit for a random seed each build)
 *   --split             enable splitStrings + transformObjectKeys (slower)
 *   --no-flatten        disable control-flow flattening (for hot paths)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const argv = process.argv.slice(2);
const flags = new Set();
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--seed') { flags.add('seed:' + argv[++i]); }
  else if (a === '--split') { flags.add('split'); }
  else if (a === '--no-flatten') { flags.add('noflatten'); }
  else if (a === '--help' || a === '-h') { positional.push('__HELP__'); }
  else { positional.push(a); }
}

if (positional.includes('__HELP__') || positional.length === 0) {
  console.log(`Usage: node obfuscate-javascript.mjs <input> [output] [--seed n] [--split] [--no-flatten]`);
  process.exit(0);
}

const input = path.resolve(positional[0]);
const output = path.resolve(positional[1] || path.join(path.dirname(input), path.basename(input) + '-obf'));
const hasSplit = flags.has('split');
const noFlatten = flags.has('noflatten');
const seedFlag = [...flags].find(f => f.startsWith('seed:'));
const seed = seedFlag ? parseInt(seedFlag.slice(5), 10) : Math.floor(Math.random() * 0x7fffffff);

const baseOptions = () => ({
  compact: true,
  controlFlowFlattening: !noFlatten,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 0.9,
  rotateStringArray: true,
  shuffleStringArray: true,
  stringArrayWrappersCount: 3,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersType: 'function',
  identifierNamesGenerator: 'hexadecimal',
  identifiersPrefix: '',
  renameGlobals: true,
  renameProperties: false,
  selfDefending: true,
  debugProtection: false, // avoid tripping CDP timing heuristics in prod accidentally
  unicodeEscapeSequence: false,
  sourceMap: false, // CRITICAL: never ship a source map
  splitStrings: hasSplit,
  splitStringsChunkLength: 8,
  transformObjectKeys: hasSplit,
  seed,
});

function obfuscateFile(srcPath, dstPath) {
  const code = fs.readFileSync(srcPath, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, baseOptions());
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  fs.writeFileSync(dstPath, result.getObfuscatedCode());
  return code.length;
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

let totalIn = 0;
let count = 0;

if (fs.statSync(input).isDirectory()) {
  const files = walk(input).filter(f => f.endsWith('.js') && !f.endsWith('.min.js.map'));
  for (const f of files) {
    const rel = path.relative(input, f);
    totalIn += obfuscateFile(f, path.join(output, rel));
    count++;
  }
} else {
  totalIn += obfuscateFile(input, path.join(output, path.basename(input)));
  count = 1;
}

// strip any stray sourceMappingURL comment from every emitted file (defense in depth)
for (const f of walk(output).filter(f => f.endsWith('.js'))) {
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/\n?\/\/[#@] sourceMappingURL=.*$/m, '').replace(/\n?\/\*[#@] sourceMappingURL=.*?\*\//g, '');
  fs.writeFileSync(f, s);
}

console.log(`Obfuscated ${count} file(s) (${totalIn} bytes input) -> ${output}`);
console.log(`seed=${seed} flatten=${!noFlatten} split=${hasSplit} sourceMap=false`);
