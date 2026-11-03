import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  FRONTEND_DIR,
  countByFileRule,
  findIncreases,
  formatViolation,
  parseCliArgs,
  readBaseline,
  rel,
  sameCounts,
  shrinkBaseline,
  sortCounts,
  writeBaseline,
} from './lint-core.mjs';

// Design and copy lint have no baseline and fail on any problem. Only ESLint is
// ratcheted, for the no-explicit-any and ban-types debt left in signing code.
const ESLINT_BASELINE = path.join(FRONTEND_DIR, 'scripts', 'eslint.baseline.json');
const ESLINT_BIN = path.join(FRONTEND_DIR, 'node_modules', '.bin', 'eslint');

function untrackedFiles() {
  const res = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '--', '.'], { cwd: FRONTEND_DIR, encoding: 'utf8' });
  if (res.status !== 0) return new Set();
  return new Set(res.stdout.split('\n').filter(Boolean).map((p) => rel(path.join(FRONTEND_DIR, p))));
}

function runEslint() {
  const res = spawnSync(ESLINT_BIN, ['.', '--ext', 'ts,tsx', '--format', 'json'], {
    cwd: FRONTEND_DIR,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (res.status !== 0 && res.status !== 1) {
    throw new Error(`eslint exited with ${res.status}\n${res.stderr}`);
  }
  const violations = [];
  for (const r of JSON.parse(res.stdout)) {
    const file = rel(r.filePath);
    for (const m of r.messages) {
      violations.push({
        file,
        line: m.line ?? 0,
        col: m.column ?? 0,
        rule: m.ruleId ?? 'parse-error',
        match: m.message,
        fix: 'see the ESLint rule docs',
        severity: 'error',
      });
    }
  }
  return violations;
}

function total(counts) {
  let problems = 0;
  for (const rules of Object.values(counts)) for (const n of Object.values(rules)) problems += n;
  return problems;
}

function main() {
  const { flags } = parseCliArgs(process.argv.slice(2));
  const violations = runEslint();
  const counts = countByFileRule(violations);
  const baselineFile = path.relative(FRONTEND_DIR, ESLINT_BASELINE);

  if (flags.has('write-baseline')) {
    const untracked = untrackedFiles();
    const kept = Object.fromEntries(Object.entries(counts).filter(([file]) => !untracked.has(file)));
    writeBaseline(ESLINT_BASELINE, kept);
    console.log(`eslint: wrote ${baselineFile} with ${total(sortCounts(kept))} problems. Untracked files start with no allowance.`);
    return;
  }

  const baseline = readBaseline(ESLINT_BASELINE);
  const increases = findIncreases(counts, baseline);
  let failed = false;

  if (increases.length > 0) {
    failed = true;
    const over = new Set(increases.map((i) => `${i.file}\u0000${i.rule}`));
    console.log(`eslint: ${increases.length} file and rule pairs went up`);
    for (const v of violations) if (over.has(`${v.file}\u0000${v.rule}`)) console.log(formatViolation(v));
    for (const i of increases) console.log(`  ${i.file} ${i.rule}: ${i.count} (baseline ${i.allowed})`);
  }

  const shrunk = shrinkBaseline(counts, baseline);
  if (!sameCounts(shrunk, baseline)) {
    if (flags.has('ci')) {
      failed = true;
      console.log(`eslint: the baseline can shrink. Run node scripts/lint-ratchet.mjs locally and commit ${baselineFile}.`);
    } else {
      writeBaseline(ESLINT_BASELINE, shrunk);
      console.log(`eslint: baseline shrank from ${total(baseline)} to ${total(shrunk)}. Commit ${baselineFile} with your change.`);
    }
  }

  console.log(`eslint: ${total(counts)} problems, baseline ${total(readBaseline(ESLINT_BASELINE))}`);
  console.log(failed ? 'ratchet: failed' : 'ratchet: passed');
  if (failed) process.exitCode = 1;
}

if (!fs.existsSync(ESLINT_BIN)) {
  console.error('ratchet: node_modules/.bin/eslint is missing. Run pnpm install first.');
  process.exit(1);
}

main();
