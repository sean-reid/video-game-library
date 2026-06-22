#!/usr/bin/env node
// Bundle-size gate. Run after `pnpm --filter @vgl/web build` (CI does this
// for free in the static job's existing build step). Reads every JS chunk
// under apps/web/dist/assets/, maps each to a budget by stripping the
// Rollup content hash, and exits 1 if any chunk or the aggregate total is
// over budget. Budgets live in apps/web/bundle-budget.json — bump them
// intentionally when a chunk grows for a real reason.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ASSETS_DIR = join(ROOT, 'apps/web/dist/assets');
const BUDGET_FILE = join(ROOT, 'apps/web/bundle-budget.json');

const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));

// Rollup hashes look like `NewsScreen-CSp02m5f.js`. Strip the trailing
// `-<hash>.js` to get the chunk name. `index` is the entry chunk.
function chunkName(filename) {
  const stem = basename(filename, '.js');
  const m = /^(.+)-[A-Za-z0-9_-]{6,}$/.exec(stem);
  return m ? m[1] : stem;
}

const files = readdirSync(ASSETS_DIR).filter((f) => f.endsWith('.js'));
const observed = {};
let totalJs = 0;
for (const f of files) {
  const size = statSync(join(ASSETS_DIR, f)).size;
  totalJs += size;
  const name = chunkName(f);
  observed[name] = (observed[name] ?? 0) + size;
}

const violations = [];
for (const [name, size] of Object.entries(observed)) {
  const cap = budget.chunks[name];
  if (cap == null) {
    violations.push(
      `new chunk "${name}" (${size} B) has no budget entry; add it to apps/web/bundle-budget.json`,
    );
    continue;
  }
  if (size > cap) {
    violations.push(`chunk "${name}" is ${size} B; budget ${cap} B (over by ${size - cap} B)`);
  }
}
for (const name of Object.keys(budget.chunks)) {
  if (observed[name] == null) {
    violations.push(`budget entry "${name}" no longer matches any chunk; remove it`);
  }
}
if (totalJs > budget.totalJs) {
  violations.push(
    `total JS ${totalJs} B exceeds ${budget.totalJs} B budget (over by ${totalJs - budget.totalJs} B)`,
  );
}

const fmt = (n) => `${(n / 1024).toFixed(1)} KiB (${n} B)`;
console.log('Bundle sizes:');
for (const [name, size] of Object.entries(observed).sort((a, b) => b[1] - a[1])) {
  const cap = budget.chunks[name];
  const status = cap == null ? '?' : size > cap ? 'FAIL' : 'ok';
  console.log(
    `  ${status.padEnd(5)} ${name.padEnd(20)} ${fmt(size).padStart(18)}   budget ${
      cap != null ? fmt(cap).padStart(18) : 'unset'
    }`,
  );
}
console.log(
  `  ----- ${'total'.padEnd(20)} ${fmt(totalJs).padStart(18)}   budget ${fmt(budget.totalJs).padStart(18)}`,
);

if (violations.length > 0) {
  console.error('\nBudget violations:');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
