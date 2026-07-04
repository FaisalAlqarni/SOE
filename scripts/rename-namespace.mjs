#!/usr/bin/env node
// Namespace-rename tool: rewrites legacy plugin namespace prefixes to `soe:`.
//
// Pure core: `transform(text)` — unit-tested.
// CLI wrapper: `node scripts/rename-namespace.mjs <dir>` — walks a directory
// recursively and rewrites the prefixes in every text file in place.

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Order longest/most-specific first so `orchestrator-supaconductor:` is matched
// before its substring `supaconductor:`. Alternation is ordered, so the first
// matching branch wins at each position.
const PREFIXES = [
  'orchestrator-supaconductor:',
  'supaconductor:',
  'sp-ecc:',
  'superpowers:',
];

const PREFIX_RE = new RegExp(
  PREFIXES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'g',
);

/**
 * Rewrite every legacy namespace prefix to `soe:`.
 * Pure: no side effects. The bare word `superpowers` (not followed by `:`)
 * is preserved because the pattern requires the trailing colon.
 * @param {string} text
 * @returns {string}
 */
export function transform(text) {
  return text.replace(PREFIX_RE, 'soe:');
}

// --- CLI ---------------------------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', '.git']);

// Heuristic: treat a buffer as binary if it contains a NUL byte in its head.
function isBinary(buf) {
  const len = Math.min(buf.length, 8000);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

function walk(dir, onFile) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), onFile);
    } else if (entry.isFile()) {
      onFile(join(dir, entry.name));
    }
  }
}

function rewriteDir(dir) {
  let changed = 0;
  let scanned = 0;
  walk(dir, (file) => {
    const buf = readFileSync(file);
    if (isBinary(buf)) return;
    scanned++;
    const original = buf.toString('utf8');
    const next = transform(original);
    if (next !== original) {
      writeFileSync(file, next);
      changed++;
      console.log(`rewrote ${file}`);
    }
  });
  console.log(`Done. Scanned ${scanned} text file(s), rewrote ${changed}.`);
}

// import.meta main-detection: only run the CLI when executed directly,
// not when imported (e.g. by the test).
const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/rename-namespace.mjs <dir>');
    process.exit(1);
  }
  const stat = statSync(dir);
  if (!stat.isDirectory()) {
    console.error(`Not a directory: ${dir}`);
    process.exit(1);
  }
  rewriteDir(dir);
}
