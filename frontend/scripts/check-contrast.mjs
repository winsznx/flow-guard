import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GLOBALS = path.join(FRONTEND_DIR, 'src', 'styles', 'globals.css');
const TOKENS_TS = path.join(FRONTEND_DIR, 'src', 'styles', 'tokens.ts');
const DESIGN_DOC = path.resolve(FRONTEND_DIR, '..', 'internal', 'redesign', 'spec', 'DESIGN_SYSTEM.md');
const QR_TOKENS = { dark: 'ink', light: 'surface' };

const TEXT_PAIRS = [
  ['ink', 'surface', ''],
  ['ink', 'canvas', ''],
  ['ink', 'sunken', ''],
  ['ink', 'brand-soft', ''],
  ['ink-secondary', 'surface', ''],
  ['ink-secondary', 'canvas', ''],
  ['ink-secondary', 'sunken', ''],
  ['ink-secondary', 'brand-soft', ''],
  ['ink-muted', 'surface', ''],
  ['ink-muted', 'canvas', ''],
  ['ink-muted', 'sunken', ''],
  ['ink-muted', 'brand-soft', ''],
  ['brand', 'surface', ''],
  ['brand', 'canvas', ''],
  ['brand', 'sunken', ''],
  ['brand', 'brand-soft', ''],
  ['brand-hover', 'surface', ''],
  ['brand-hover', 'canvas', ''],
  ['brand-hover', 'sunken', ''],
  ['brand-hover', 'brand-soft', ''],
  ['success-ink', 'success-tint', 'pill and notice text'],
  ['success-ink', 'surface', ''],
  ['success-ink', 'canvas', ''],
  ['ink', 'success-tint', 'notice title'],
  ['ink-secondary', 'success-tint', 'notice body'],
  ['ink-muted', 'success-tint', ''],
  ['warning-ink', 'warning-tint', 'pill and notice text'],
  ['warning-ink', 'surface', ''],
  ['warning-ink', 'canvas', ''],
  ['ink', 'warning-tint', 'notice title'],
  ['ink-secondary', 'warning-tint', 'notice body'],
  ['ink-muted', 'warning-tint', ''],
  ['danger-ink', 'danger-tint', 'pill and notice text'],
  ['danger-ink', 'surface', ''],
  ['danger-ink', 'canvas', ''],
  ['ink', 'danger-tint', 'notice title'],
  ['ink-secondary', 'danger-tint', 'notice body'],
  ['ink-muted', 'danger-tint', ''],
  ['info-ink', 'info-tint', 'pill and notice text'],
  ['info-ink', 'surface', ''],
  ['info-ink', 'canvas', ''],
  ['ink', 'info-tint', 'notice title'],
  ['ink-secondary', 'info-tint', 'notice body'],
  ['ink-muted', 'info-tint', ''],
  ['neutral-ink', 'neutral-tint', 'pill and notice text'],
  ['neutral-ink', 'surface', ''],
  ['neutral-ink', 'canvas', ''],
  ['ink', 'neutral-tint', 'notice title'],
  ['ink-secondary', 'neutral-tint', 'notice body'],
  ['ink-muted', 'neutral-tint', ''],
  ['on-brand', 'brand', 'primary button'],
  ['on-brand', 'brand-hover', ''],
  ['on-brand', 'brand-pressed', ''],
  ['on-brand', 'danger-fill', 'destructive confirm'],
  ['on-brand', 'danger-fill-hover', ''],
  ['ink-inverse', 'inverse', 'dark band, tooltip'],
  ['ink-inverse-muted', 'inverse', ''],
  ['marker', 'inverse', 'accent phrase on the band'],
  ['inverse', 'marker', 'primary pill on the band'],
  ['ink', 'marker', 'selected text'],
];

const MARK_PAIRS = [
  ['line-control', 'surface', 'input edge'],
  ['line-control', 'canvas', 'input edge'],
  ['line-control', 'sunken', 'input edge'],
  ['line-control', 'brand-soft', 'input edge'],
  ['line-control', 'neutral-tint', 'input edge'],
  ['focus', 'surface', 'focus ring'],
  ['focus', 'canvas', 'focus ring'],
  ['focus', 'sunken', 'focus ring'],
  ['focus', 'brand-soft', 'focus ring'],
  ['success-dot', 'surface', ''],
  ['success-dot', 'success-tint', 'dot in its pill'],
  ['success-dot', 'canvas', ''],
  ['focus', 'success-tint', 'ring on a tinted chip'],
  ['warning-dot', 'surface', ''],
  ['warning-dot', 'warning-tint', 'dot in its pill'],
  ['warning-dot', 'canvas', ''],
  ['focus', 'warning-tint', 'ring on a tinted chip'],
  ['danger-dot', 'surface', ''],
  ['danger-dot', 'danger-tint', 'dot in its pill'],
  ['danger-dot', 'canvas', ''],
  ['focus', 'danger-tint', 'ring on a tinted chip'],
  ['info-dot', 'surface', ''],
  ['info-dot', 'info-tint', 'dot in its pill'],
  ['info-dot', 'canvas', ''],
  ['focus', 'info-tint', 'ring on a tinted chip'],
  ['neutral-dot', 'surface', ''],
  ['neutral-dot', 'neutral-tint', 'dot in its pill'],
  ['neutral-dot', 'canvas', ''],
  ['focus', 'neutral-tint', 'ring on a tinted chip'],
  ['focus-inverse', 'inverse', 'ring on the band'],
  ['ink-inverse-muted', 'inverse', 'secondary button edge on the band'],
  ['brand', 'sunken', 'claimed block on track'],
  ['success-dot', 'sunken', 'ready block on track'],
  [{ pattern: 'ready', over: 'success-dot' }, 'sunken', 'ready block stripe on track'],
  [{ pattern: 'ready', over: 'success-dot' }, 'surface', 'ready block stripe on a panel'],
  ['line-control', 'surface', 'outline of a hatched later or waiting block'],
  ['line-control', 'sunken', 'outline of a later segment inside a release bar track'],
  ['warning-dot', 'sunken', 'slow day block'],
];

const INFO_PAIRS = [
  ['line', 'surface', 'decorative edge'],
  ['line-strong', 'surface', 'decorative edge'],
  ['surface', 'canvas', 'panel on canvas'],
  ['brand', 'success-dot', 'claimed next to ready'],
  ['brand', 'inverse', 'never used, blocked by the API and the lint'],
  [{ pattern: 'hatch', over: 'sunken' }, 'surface', 'texture only, the outline carries the mark'],
  ['sunken', 'surface', 'fill of a later block, the outline carries the mark'],
  ['brand', 'line-control', 'leading vote bar next to other bars'],
];

const SECTIONS = [
  { heading: '### 3.1', pairs: TEXT_PAIRS, min: 4.5 },
  { heading: '### 3.2', pairs: MARK_PAIRS, min: 3 },
  { heading: '### 3.3', pairs: INFO_PAIRS, min: null },
];

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function topLevelBlocks(css, selectorRe) {
  const blocks = [];
  let depth = 0;
  let start = -1;
  let header = '';
  let headerStart = 0;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') {
      if (depth === 0) {
        header = css.slice(headerStart, i).trim();
        start = i + 1;
      }
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        if (selectorRe.test(header)) blocks.push(css.slice(start, i));
        headerStart = i + 1;
      }
    } else if (ch === ';' && depth === 0) {
      headerStart = i + 1;
    }
  }
  return blocks;
}

export function readTokens(cssText = fs.readFileSync(GLOBALS, 'utf8')) {
  const css = stripComments(cssText);
  const vars = new Map();
  for (const block of topLevelBlocks(css, /^(?:@theme|:root)$/)) {
    for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      if (!vars.has(m[1])) vars.set(m[1], m[2].trim());
    }
  }
  return vars;
}

function resolveVar(vars, name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`var() cycle at ${name}`);
  seen.add(name);
  const value = vars.get(name);
  if (value === undefined) throw new Error(`${name} is not defined in globals.css`);
  return value.replace(/var\((--[\w-]+)\)/g, (_, inner) => resolveVar(vars, inner, seen));
}

function parseColor(value) {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:\s*[/,]\s*([\d.]+))?\s*\)$/i.exec(v);
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: rgb[4] === undefined ? 1 : Number(rgb[4]) };
  throw new Error(`can't read color "${value}"`);
}

const toHex = ({ r, g, b }) => `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

function roundHalfEven(n) {
  const floor = Math.floor(n);
  const diff = n - floor;
  if (Math.abs(diff - 0.5) > 1e-9) return Math.round(n);
  return floor % 2 === 0 ? floor : floor + 1;
}

function blend(top, under) {
  const mix = (t, u) => roundHalfEven(t * top.a + u * (1 - top.a));
  return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a: 1 };
}

function luminance({ r, g, b }) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const truncate2 = (n) => (Math.floor(n * 100 + 1e-9) / 100).toFixed(2);

function makeResolver(vars) {
  const color = (token) => parseColor(resolveVar(vars, `--color-${token}`));
  const tokenNameFor = (c) => {
    for (const name of vars.keys()) {
      if (!name.startsWith('--color-')) continue;
      const value = resolveVar(vars, name);
      if (!/^#/.test(value)) continue;
      const other = parseColor(value);
      if (other.r === c.r && other.g === c.g && other.b === c.b) return name.slice('--color-'.length);
    }
    return toHex(c);
  };
  const side = (spec) => {
    if (typeof spec === 'string') {
      const c = color(spec);
      if (c.a !== 1) throw new Error(`--color-${spec} is translucent; give the background it sits on`);
      return { color: c, label: `\`${spec}\` ${toHex(c)}` };
    }
    const pattern = resolveVar(vars, `--pattern-${spec.pattern}`);
    const stripe = /rgba?\([^)]*\)/.exec(pattern);
    if (!stripe) throw new Error(`--pattern-${spec.pattern} has no stripe color`);
    const top = parseColor(stripe[0]);
    const mixed = blend(top, color(spec.over));
    const label = `${spec.pattern} stripe ${toHex(mixed)} (${tokenNameFor(top)} ${top.a} over \`${spec.over}\`)`;
    return { color: mixed, label };
  };
  return side;
}

export function buildTables(vars) {
  const side = makeResolver(vars);
  const failures = [];
  const tables = SECTIONS.map(({ heading, pairs, min }) => {
    const rows = pairs.map(([fgSpec, bgSpec, where]) => {
      const fg = side(fgSpec);
      const bg = side(bgSpec);
      const ratio = truncate2(contrast(fg.color, bg.color));
      let result = 'measured';
      if (min !== null) {
        result = Number(ratio) >= min ? 'pass' : 'fail';
        if (result === 'fail') failures.push(`${fg.label} on ${bg.label}: ${ratio} is below ${min}`);
      }
      return `| ${fg.label} | ${bg.label} | ${ratio} | ${result} | ${where} |`;
    });
    return { heading, rows };
  });
  return { tables, failures };
}

function docRows(doc, heading) {
  const start = doc.indexOf(`\n${heading} `);
  if (start === -1) return null;
  const rest = doc.slice(start + 1);
  const next = rest.slice(heading.length).search(/\n#{2,3} /);
  const section = next === -1 ? rest : rest.slice(0, next + heading.length);
  return section
    .split('\n')
    .filter((l) => l.startsWith('| ') && !l.startsWith('| Foreground') && !/^\|\s*-/.test(l))
    .map((l) => l.replace(/\s+$/, ''));
}

function checkQrColors(vars) {
  if (!fs.existsSync(TOKENS_TS)) return ['src/styles/tokens.ts is missing; it holds QR_COLORS'];
  const source = fs.readFileSync(TOKENS_TS, 'utf8');
  const problems = [];
  for (const [key, token] of Object.entries(QR_TOKENS)) {
    const m = new RegExp(`\\b${key}\\s*:\\s*'(#[0-9a-fA-F]{6})'`).exec(source);
    const expected = toHex(parseColor(resolveVar(vars, `--color-${token}`)));
    if (!m) problems.push(`src/styles/tokens.ts: QR_COLORS.${key} not found`);
    else if (m[1].toUpperCase() !== expected) problems.push(`src/styles/tokens.ts: QR_COLORS.${key} is ${m[1]}, globals.css --color-${token} is ${expected}`);
  }
  return problems;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const vars = readTokens();
  const { tables, failures } = buildTables(vars);

  if (args.has('--print')) {
    for (const { heading, rows } of tables) {
      console.log(heading);
      console.log('| Foreground | Background | Ratio | Result | Where |');
      console.log('|---|---|---|---|---|');
      for (const row of rows) console.log(row);
      console.log('');
    }
    return;
  }

  const problems = [...failures.map((f) => `contrast: ${f}`), ...checkQrColors(vars).map((p) => `qr: ${p}`)];

  if (fs.existsSync(DESIGN_DOC)) {
    const doc = fs.readFileSync(DESIGN_DOC, 'utf8');
    for (const { heading, rows } of tables) {
      const documented = docRows(doc, heading);
      if (!documented) {
        problems.push(`doc: DESIGN_SYSTEM.md has no section ${heading}`);
        continue;
      }
      const max = Math.max(rows.length, documented.length);
      for (let i = 0; i < max; i += 1) {
        if (rows[i] !== documented[i]) {
          problems.push(`doc: ${heading} row ${i + 1} differs\n    tokens: ${rows[i] ?? '(none)'}\n    doc:    ${documented[i] ?? '(none)'}`);
        }
      }
    }
  } else {
    console.log(`check-contrast: ${path.relative(FRONTEND_DIR, DESIGN_DOC)} not found, skipped the table comparison`);
  }

  const counts = tables.map((t) => t.rows.length);
  console.log(`check-contrast: ${counts[0]} text pairs, ${counts[1]} mark pairs, ${counts[2]} measured pairs`);
  if (problems.length > 0) {
    for (const p of problems) console.log(p);
    console.log(`check-contrast: ${problems.length} problems. Run with --print to see the tables the tokens produce.`);
    process.exitCode = 1;
  } else {
    console.log('check-contrast: every text and mark pair passes, QR colors match, and DESIGN_SYSTEM.md section 3 matches the tokens');
  }
}

main();
