import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

export const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SRC_DIR = path.join(FRONTEND_DIR, 'src');

export { ts };

export function rel(file) {
  return path.relative(FRONTEND_DIR, file).split(path.sep).join('/');
}

export function isMain(moduleUrl) {
  return Boolean(process.argv[1]) && moduleUrl === pathToFileURL(path.resolve(process.argv[1])).href;
}

let cachedProgram = null;

export function getProgram() {
  if (cachedProgram) return cachedProgram;
  const configPath = path.join(FRONTEND_DIR, 'tsconfig.json');
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error) {
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, FRONTEND_DIR, undefined, configPath);
  cachedProgram = ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true } });
  cachedProgram.getTypeChecker();
  return cachedProgram;
}

export function sourceFilesUnderSrc(program) {
  return program
    .getSourceFiles()
    .filter((sf) => !sf.isDeclarationFile && sf.fileName.startsWith(SRC_DIR + path.sep) && /\.tsx?$/.test(sf.fileName));
}

export function positionOf(sf, pos) {
  const { line, character } = sf.getLineAndCharacterOfPosition(pos);
  return { line: line + 1, col: character + 1 };
}

export function lineColAt(text, index) {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, col: index - lineStart + 1 };
}

export function jsxTagName(node) {
  const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return tag.getText();
}

export function jsxAttributeName(attr) {
  return attr.name.getText();
}

export function formatViolation(v) {
  const head = `${v.file}:${v.line}:${v.col} ${v.rule} ${JSON.stringify(v.match)}`;
  const tag = v.severity === 'warn' ? ' (warning)' : '';
  return `${head}${tag}\n  fix: ${v.fix}`;
}

export function countByFileRule(violations) {
  const counts = {};
  for (const v of violations) {
    if (v.severity === 'warn') continue;
    counts[v.file] ??= {};
    counts[v.file][v.rule] = (counts[v.file][v.rule] ?? 0) + 1;
  }
  return counts;
}

export function sortCounts(counts) {
  const sorted = {};
  for (const file of Object.keys(counts).sort()) {
    const rules = {};
    for (const rule of Object.keys(counts[file]).sort()) {
      if (counts[file][rule] > 0) rules[rule] = counts[file][rule];
    }
    if (Object.keys(rules).length > 0) sorted[file] = rules;
  }
  return sorted;
}

export function readBaseline(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeBaseline(file, counts) {
  fs.writeFileSync(file, `${JSON.stringify(sortCounts(counts), null, 2)}\n`);
}

export function findIncreases(counts, baseline) {
  const increases = [];
  for (const [file, rules] of Object.entries(counts)) {
    for (const [rule, count] of Object.entries(rules)) {
      const allowed = baseline[file]?.[rule] ?? 0;
      if (count > allowed) increases.push({ file, rule, count, allowed });
    }
  }
  return increases.sort((a, b) => a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule));
}

export function shrinkBaseline(counts, baseline) {
  const next = {};
  for (const [file, rules] of Object.entries(baseline)) {
    for (const [rule, allowed] of Object.entries(rules)) {
      const now = Math.min(counts[file]?.[rule] ?? 0, allowed);
      if (now > 0) {
        next[file] ??= {};
        next[file][rule] = now;
      }
    }
  }
  return sortCounts(next);
}

export function sameCounts(a, b) {
  return JSON.stringify(sortCounts(a)) === JSON.stringify(sortCounts(b));
}

export function parseCliArgs(argv) {
  const flags = new Set();
  const options = {};
  const files = [];
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (value === undefined) flags.add(key);
      else options[key] = value;
    } else {
      files.push(rel(path.resolve(process.cwd(), arg)));
    }
  }
  return { flags, options, files };
}

export async function runLintCli({ name, run }) {
  const { flags, files } = parseCliArgs(process.argv.slice(2));
  const violations = await run();
  const selected = files.length > 0 ? violations.filter((v) => files.includes(v.file)) : violations;

  if (flags.has('json')) {
    process.stdout.write(`${JSON.stringify(selected, null, 2)}\n`);
    return;
  }

  const problems = selected.filter((v) => v.severity !== 'warn');
  const warnings = selected.length - problems.length;
  for (const v of flags.has('all') ? selected : problems) console.log(formatViolation(v));

  const byRule = {};
  for (const v of problems) byRule[v.rule] = (byRule[v.rule] ?? 0) + 1;
  const ruleSummary = Object.entries(byRule)
    .sort((a, b) => b[1] - a[1])
    .map(([rule, n]) => `${rule} ${n}`)
    .join(', ');
  const fileCount = new Set(problems.map((v) => v.file)).size;

  console.log('');
  console.log(`${name}: ${problems.length} problems${warnings ? ` and ${warnings} warnings` : ''} in ${fileCount} files${ruleSummary ? ` (${ruleSummary})` : ''}`);
  if (problems.length > 0) {
    console.log(`${name}: failed. Every problem is an error, there is no baseline.`);
    process.exitCode = 1;
  } else if (warnings > 0 && !flags.has('all')) {
    console.log(`${name}: passed. Run with --all to list the warnings.`);
  }
}
