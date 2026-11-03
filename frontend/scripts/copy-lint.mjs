import fs from 'node:fs';
import path from 'node:path';
import {
  FRONTEND_DIR,
  SRC_DIR,
  getProgram,
  isMain,
  jsxAttributeName,
  jsxTagName,
  positionOf,
  rel,
  runLintCli,
  sourceFilesUnderSrc,
  ts,
} from './lint-core.mjs';

const GLOSSARY_FILE = 'src/copy/glossary.ts';
const PROPER_NOUNS_FILE = 'src/copy/properNouns.ts';
const WALLET_PATTERNS_FILE = 'src/utils/walletErrorPatterns.ts';
const UPDATE_DETAIL_FILE = 'src/pages/UpdateDetailPage.tsx';
const LEGAL_FILES = new Set(['src/pages/TermsPage.tsx', 'src/pages/PrivacyPage.tsx', 'src/pages/DisclaimerPage.tsx']);
const KIT_DIR = 'src/pages/dev/';
const COPY_DIR = 'src/copy/';

const USER_FACING_NAMES = new Set(['title', 'label', 'placeholder', 'aria-label', 'alt', 'description', 'helper', 'busyLabel', 'disabledReason']);
const USER_FACING_PATTERN = /label|text|title|message|description|placeholder|heading|hint|cta/i;
const NOT_USER_FACING = /className$|Id$|Ids$|by$|^data-|^on[A-Z]|Key$|Href$|Url$|Path$/;
const COPY_SKIP_KEYS = new Set(['path', 'to', 'href', 'icon', 'id', 'className', 'key', 'code', 'avoid', 'avoidInContext', 'tone', 'kind', 'type', 'variant', 'status', 'as', 'size']);
const CASE_TAGS = new Set(['button', 'Button', 'ButtonLink', 'IconButton', 'a', 'Link', 'NavLink', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'Heading', 'Display', 'Tab', 'PageHeader', 'summary', 'legend', 'th']);
const CASE_KEYS = /^(?:title|label|heading|cta|aria-label)$|(?:Label|Title|Heading|Cta)$/;
const TOAST_CALLEES = /^(?:toast|notify|showToast|addToast|pushToast|showNotice|set\w*(?:Error|Notice|Message|Toast|Warning|Feedback|StatusText))$/;

const HYPE = ['seamless', 'robust', 'powerful', 'unlock', 'unlocks', 'unlocked', 'leverage', 'effortless', 'revolutionary', 'cutting-edge', 'next-gen', 'utilize', 'simply', 'successfully', 'please', 'production-grade', 'audited', 'operating layer'];
const JARGON = ['covenant', 'UTXO', 'CashScript', 'P2PKH', 'P2SH', 'Merkle', 'BCMR', 'PSBT', 'tranche', 'cliff', 'cadence', 'runway', 'vested', 'vesting stream', 'NFT commitment', 'state NFT', 'chipnet', 'testnet', 'mainnet', 'sats', 'satoshis', 'indexer', 'executor', 'backend', 'txid', 'tx hash', 'category ID', 'pubkey', 'primitive', 'primitives', 'off-chain', 'on-chain', 'on chain', 'onchain', 'smart contract', 'operating layer', 'oracle', 'artifact', 'mint authority', 'relay', 'blockchain', 'block height'];
const KIT_ONLY_JARGON = new Set(['primitive', 'primitives']);

const FIX = {
  dash: 'rewrite with a comma, a period or "to" for ranges; no dashes between words',
  ellipsis: 'end the sentence with a period; the ellipsis character only goes inside a shortened address',
  exclaim: 'end the sentence with a period',
  symbols: 'use words or an Icon instead of the symbol',
  case: 'use sentence case: capitalize the first word and proper nouns from copy/properNouns.ts only',
  hype: 'cut the word, or say the plain fact instead',
  jargon: 'use the glossary term from VOICE_AND_COPY.md (for example "address", "transaction", "test network")',
  'banned-variant': 'use the glossary term; banned variants are listed in copy/glossary.ts',
  'failed-to': 'start with what happened, for example "Couldn\'t create the stream", and say whether money moved',
  'not-x-but-y': 'state the point directly instead of correcting a claim nobody made',
  'dev-text': 'move developer details out of user copy; show a plain sentence from copy/errors.ts',
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phraseRe = (term, { plural = false } = {}) => {
  const body = term.split(/\s+/).map(escapeRe).join('\\s+');
  return new RegExp(`(?<![\\w-])${body}${plural ? 's?' : ''}(?![\\w-])`, 'i');
};

function unwrap(expr) {
  let e = expr;
  while (e && (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isSatisfiesExpression?.(e) || ts.isTypeAssertionExpression(e))) e = e.expression;
  return e;
}

function stringsOf(expr) {
  const e = unwrap(expr);
  if (!e) return null;
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text];
  if (ts.isArrayLiteralExpression(e)) {
    const values = e.elements.map((el) => unwrap(el)).filter((el) => ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el));
    return values.length === e.elements.length ? values.map((el) => el.text) : null;
  }
  if (ts.isNewExpression(e) && e.expression.getText() === 'Set' && e.arguments?.length === 1) return stringsOf(e.arguments[0]);
  return null;
}

function parseSource(relPath) {
  const full = path.join(FRONTEND_DIR, relPath);
  if (!fs.existsSync(full)) return null;
  return ts.createSourceFile(full, fs.readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

const notices = [];

export function loadProperNouns() {
  const sf = parseSource(PROPER_NOUNS_FILE);
  if (!sf) {
    notices.push(`copy-lint: ${PROPER_NOUNS_FILE} doesn't exist yet, so the case rule is skipped. Rerun once it lands.`);
    return null;
  }
  const nouns = [];
  const caps = [];
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      const values = decl.initializer ? stringsOf(decl.initializer) : null;
      if (!values || !ts.isIdentifier(decl.name)) continue;
      if (/caps|upper|acronym|abbreviation/i.test(decl.name.text)) caps.push(...values);
      else nouns.push(...values);
    }
  }
  if (nouns.length === 0) {
    notices.push(`copy-lint: ${PROPER_NOUNS_FILE} exports no string array, so the case rule is skipped.`);
    return null;
  }
  return { nouns, caps: new Set([...caps, ...nouns.filter((n) => /^[A-Z0-9]+$/.test(n))]) };
}

export function loadBannedVariants() {
  const sf = parseSource(GLOSSARY_FILE);
  if (!sf) {
    notices.push(`copy-lint: ${GLOSSARY_FILE} doesn't exist yet, so the banned-variant rule is skipped. Rerun once it lands.`);
    return null;
  }
  const banned = new Set();
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(sf).replace(/['"]/g, '') === 'avoid') {
      for (const v of stringsOf(node.initializer) ?? []) if (v.trim()) banned.add(v.trim());
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (banned.size === 0) notices.push(`copy-lint: ${GLOSSARY_FILE} has no avoid entries, so the banned-variant rule finds nothing.`);
  return [...banned];
}

function stripForChecks(text) {
  return text.replace(/\b(?:https?:\/\/|mailto:)\S+/g, 'x');
}

function sentenceWords(sentence) {
  return [...sentence.matchAll(/[A-Za-z0-9][A-Za-z0-9_'’-]*/g)].map((m) => m[0]);
}

function makeChecks({ properNouns, banned }) {
  const hype = HYPE.map((t) => [t, phraseRe(t)]);
  const jargon = JARGON.map((t) => [t, phraseRe(t, { plural: !t.includes(' ') && !t.endsWith('s') })]);
  const listed = new Set([...HYPE, ...JARGON].map((t) => t.toLowerCase()));
  const bannedRes = (banned ?? []).filter((t) => !listed.has(t.toLowerCase())).map((t) => [t, phraseRe(t)]);
  const nounRes = properNouns
    ? [...properNouns.nouns].sort((a, b) => b.length - a.length).map((n) => new RegExp(`(?<![\\w])${escapeRe(n)}(?:'s|’s)?(?![\\w])`, 'g'))
    : [];

  return (rawText, { caseContext, file }) => {
    const found = [];
    const text = stripForChecks(rawText);
    const add = (rule, match) => found.push({ rule, match });

    const dash = /—|–|&mdash;|&ndash;|[A-Za-z0-9)] - [A-Za-z0-9(]/.exec(text);
    if (dash) add('dash', dash[0]);
    if (text.includes('...')) add('ellipsis', '...');
    else if (text.trim() !== '…' && /(?:^|\s)…|…(?:\s|$)/.test(text)) add('ellipsis', '…');
    const exclaim = /[A-Za-z0-9)'"’”]!+(?=\s|$|["'’”)])/.exec(text);
    if (exclaim) add('exclaim', exclaim[0]);
    const symbol = /(?![©®™])\p{Extended_Pictographic}|[⚠✓✗→←↗]/u.exec(text);
    if (symbol) add('symbols', symbol[0]);

    for (const [term, re] of hype) if (re.test(text)) add('hype', term);
    const kit = file.startsWith(KIT_DIR);
    for (const [term, re] of jargon) {
      if (kit && KIT_ONLY_JARGON.has(term)) continue;
      if (re.test(text)) add('jargon', term);
    }
    if (file !== GLOSSARY_FILE) for (const [term, re] of bannedRes) if (re.test(text)) add('banned-variant', term);

    if (/^\s*(?:failed to|unable to|error:)/i.test(text)) add('failed-to', text.trim().split(/\s+/).slice(0, 3).join(' '));
    const notBut = /\bnot\b[^.]{1,40},?\s+but\b/i.exec(text) ?? /\bit'?s not\b[^.]+\bit'?s\b/i.exec(text);
    if (notBut) add('not-x-but-y', notBut[0]);
    const dev = /VITE_|\.env\b|localhost|\/api\/|HTTP \d{3}|\b[A-Za-z_$][\w$]*\(\)|\b(?:undefined|null|NaN)\b/.exec(text);
    if (dev) add('dev-text', dev[0]);

    if (properNouns) {
      let masked = text;
      for (const re of nounRes) masked = masked.replace(re, 'x');
      const allCaps = sentenceWords(masked).find((w) => /^[A-Z][A-Z0-9]+$/.test(w) && !properNouns.caps.has(w));
      if (allCaps) add('case', allCaps);
      else if (caseContext) {
        for (const sentence of masked.split(/[.!?:;]\s+|\n|\s·\s/)) {
          const words = sentenceWords(sentence).filter((w) => !w.includes('_'));
          const title = words.slice(1).find((w) => /^[A-Z][a-z]/.test(w) && w !== 'I' && !/^I['’]/.test(w));
          if (title) {
            add('case', title);
            break;
          }
        }
      }
    }
    return found;
  };
}

function textPieces(expr, sf) {
  const e = unwrap(expr);
  if (!e) return [];
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [{ text: e.text, node: e }];
  if (ts.isTemplateExpression(e)) {
    const text = e.head.text + e.templateSpans.map((s) => `x${s.literal.text}`).join('');
    return [{ text, node: e }, ...e.templateSpans.flatMap((s) => textPieces(s.expression, sf))];
  }
  if (ts.isConditionalExpression(e)) return [...textPieces(e.whenTrue, sf), ...textPieces(e.whenFalse, sf)];
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return textPieces(e.right, sf);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.PlusToken) {
      return [...textPieces(e.left, sf), ...textPieces(e.right, sf)];
    }
  }
  return [];
}

function isUserFacingName(name) {
  if (NOT_USER_FACING.test(name)) return false;
  return USER_FACING_NAMES.has(name) || USER_FACING_PATTERN.test(name);
}

function propertyKey(node, sf) {
  const name = node.name;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isPrivateIdentifier(name)) return name.text;
  return name.getText(sf);
}

function inCaseElement(node) {
  let depth = 0;
  for (let p = node.parent; p && depth < 2; p = p.parent) {
    if (ts.isJsxElement(p)) {
      if (CASE_TAGS.has(jsxTagName(p))) return true;
      depth += 1;
    }
  }
  return false;
}

function isSkippedCopyLiteral(node, sf) {
  for (let p = node.parent, child = node; p; child = p, p = p.parent) {
    if (ts.isTypeNode(p) || ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isImportTypeNode?.(p)) return true;
    if (ts.isPropertyAssignment(p)) {
      if (p.name === child) return true;
      if (COPY_SKIP_KEYS.has(propertyKey(p, sf))) return true;
      return false;
    }
    if (ts.isElementAccessExpression(p) && p.argumentExpression === child) return true;
    if (ts.isCaseClause(p) && p.expression === child) return true;
    if (ts.isBinaryExpression(p)) {
      const k = p.operatorToken.kind;
      if ([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.InKeyword].includes(k)) return true;
    }
    if (ts.isCallExpression(p) && p.arguments.includes(child)) {
      const callee = p.expression;
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : '';
      if (['includes', 'startsWith', 'endsWith', 'indexOf', 'split', 'join', 'replace', 'replaceAll', 'padStart', 'padEnd', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'NumberFormat', 'DateTimeFormat', 'RelativeTimeFormat', 'PluralRules', 'get', 'has', 'getItem', 'setItem', 'removeItem', 'require', 'matchMedia', 'querySelector'].includes(name)) return true;
    }
    if (ts.isNewExpression(p) && ts.isPropertyAccessExpression(p.expression) && p.expression.expression.getText(sf) === 'Intl') return true;
    if (ts.isStatement(p)) return false;
  }
  return false;
}

function looksLikeMachineText(text) {
  const t = text.trim();
  if (t === '' || /^(?:https?:\/\/|mailto:|\/|#|\.\/|\.\.\/)/.test(t) || /^[A-Z][A-Z0-9]*_[A-Z0-9_]*$|^[A-Z]{4,}$/.test(t)) return true;
  return /^[\w.-]+$/.test(t) && /[_./]|^[a-z]+[A-Z]/.test(t);
}

function lintFile(sf, check, out) {
  const file = rel(sf.fileName);
  if (file === WALLET_PATTERNS_FILE || file === PROPER_NOUNS_FILE) return;
  const severity = LEGAL_FILES.has(file) ? 'warn' : 'error';
  const isCopyModule = file.startsWith(COPY_DIR);
  const seen = new Set();

  const emit = (text, node, caseContext) => {
    const key = `${node.pos}:${node.end}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (looksLikeMachineText(text)) return;
    for (const f of check(text, { caseContext, file })) {
      const { line, col } = positionOf(sf, node.getStart(sf));
      out.push({ file, line, col, rule: f.rule, match: f.match, fix: FIX[f.rule], severity });
    }
  };
  const emitPieces = (expr, caseContext) => {
    for (const p of textPieces(expr, sf)) emit(p.text, p.node, caseContext);
  };

  const visit = (node) => {
    if (isCopyModule) {
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isSkippedCopyLiteral(node, sf)) {
        const owner = node.parent && ts.isPropertyAssignment(node.parent) ? propertyKey(node.parent, sf) : '';
        emit(node.text, node, CASE_KEYS.test(owner));
      } else if (ts.isTemplateExpression(node) && !isSkippedCopyLiteral(node, sf)) {
        const owner = node.parent && ts.isPropertyAssignment(node.parent) ? propertyKey(node.parent, sf) : '';
        const text = node.head.text + node.templateSpans.map((s) => `x${s.literal.text}`).join('');
        emit(text, node, CASE_KEYS.test(owner));
      }
      ts.forEachChild(node, visit);
      return;
    }

    if (ts.isJsxText(node)) {
      const raw = node.getText(sf);
      if (raw.trim()) emit(raw.replace(/\s+/g, ' ').trim(), node, inCaseElement(node));
    } else if (ts.isJsxExpression(node) && node.expression && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      emitPieces(node.expression, inCaseElement(node));
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = jsxAttributeName(node);
      if (isUserFacingName(name)) {
        const caseContext = CASE_KEYS.test(name);
        if (ts.isStringLiteral(node.initializer)) emit(node.initializer.text, node.initializer, caseContext);
        else if (ts.isJsxExpression(node.initializer)) emitPieces(node.initializer.expression, caseContext);
      }
    } else if (ts.isPropertyAssignment(node)) {
      const key = propertyKey(node, sf);
      const articleBody = file === UPDATE_DETAIL_FILE && key === 'content';
      if (!articleBody && isUserFacingName(key)) emitPieces(node.initializer, CASE_KEYS.test(key));
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && /Error$/.test(node.expression.text)) {
      for (const arg of node.arguments ?? []) emitPieces(arg, false);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isToast = (ts.isIdentifier(callee) && TOAST_CALLEES.test(callee.text)) ||
        (ts.isPropertyAccessExpression(callee) && (TOAST_CALLEES.test(callee.name.text) || callee.expression.getText(sf) === 'toast'));
      if (isToast) for (const arg of node.arguments) emitPieces(arg, false);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

export function runCopyLint() {
  notices.length = 0;
  const properNouns = loadProperNouns();
  const banned = loadBannedVariants();
  for (const n of notices) console.error(n);
  const check = makeChecks({ properNouns, banned });
  const program = getProgram();
  const out = [];
  for (const sf of sourceFilesUnderSrc(program)) {
    if (!sf.fileName.startsWith(SRC_DIR)) continue;
    lintFile(sf, check, out);
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col || a.rule.localeCompare(b.rule));
}

function inputsReady() {
  return fs.existsSync(path.join(FRONTEND_DIR, GLOSSARY_FILE)) && fs.existsSync(path.join(FRONTEND_DIR, PROPER_NOUNS_FILE));
}

if (isMain(import.meta.url)) {
  if (inputsReady()) {
    await runLintCli({ name: 'copy-lint', run: runCopyLint });
  } else {
    console.error(`copy-lint: ${GLOSSARY_FILE} and ${PROPER_NOUNS_FILE} must both exist`);
    process.exitCode = 1;
  }
}
