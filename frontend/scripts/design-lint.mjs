import fs from 'node:fs';
import path from 'node:path';
import { compile } from 'tailwindcss';
import {
  FRONTEND_DIR,
  SRC_DIR,
  getProgram,
  isMain,
  jsxAttributeName,
  jsxTagName,
  lineColAt,
  positionOf,
  rel,
  runLintCli,
  sourceFilesUnderSrc,
  ts,
} from './lint-core.mjs';

const PRIMITIVE_DIRS = ['src/components/ui/', 'src/components/layout/', 'src/components/marketing/'];
const RAW_COLOR_ALLOWED = new Set(['src/styles/globals.css', 'src/styles/tokens.ts']);
const CLASS_HELPERS = new Set(['cx']);
const TW_TAG = 'tw';

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOR_PREFIX = 'bg|text|border|ring|ring-offset|outline|fill|stroke|from|via|to|divide|placeholder|decoration|shadow|accent|caret';
const SIDE = '(?:-(?:t|r|b|l|x|y|s|e|tl|tr|br|bl))?';
const STOCK_PALETTE_RE = new RegExp(`^(?:${COLOR_PREFIX})${SIDE}-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:/.+)?$`);

const LEGACY_COLOR_NAMES = [
  'textPrimary', 'textSecondary', 'textMuted', 'text-primary', 'text-secondary', 'text-muted',
  'surfaceAlt', 'surface-alt', 'background', 'whiteAlt', 'primary', 'primaryHover', 'primary-hover',
  'primarySoft', 'primary-soft', 'accent', 'accentHover', 'accent-hover', 'accentDim', 'accent-dim',
  'secondary', 'secondaryHover', 'secondary-hover', 'success', 'warning', 'error', 'info', 'border',
  'borderHover', 'border-hover', 'focusRing', 'focus-ring', 'highlight', 'brand-50', 'brand-100',
  'brand-300', 'brand-700', 'brand50', 'brand100', 'brand300', 'brand700',
];
const LEGACY_COLOR_RE = new RegExp(`^(?:${COLOR_PREFIX})${SIDE}-(?:${LEGACY_COLOR_NAMES.join('|')})(?:/.+)?$`);
const LEGACY_STOCK_RES = [
  /^z-\d+$/,
  /^duration-\d+$/,
  /^ease-(?:in|out|in-out|linear)$/,
  /^rounded(?:-(?:t|r|b|l|tl|tr|br|bl|s|e|ss|se|es|ee))?(?:-(?:sm|md|lg|xl|2xl|3xl))?$/,
  /^shadow(?:-(?:sm|md|lg|xl|2xl))?$/,
  /^text-(?:xs|sm|base|lg|xl|[2-9]xl)(?:\/.+)?$/,
  /^font-(?:bold|extrabold)$/,
  /^tracking-.+$/,
  /^leading-(?!prose$).+$/,
  /^max-w-(?:xs|sm|md|lg|xl|[2-7]xl)$/,
];

const SPACING_PREFIX = 'p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|w|h|min-w|min-h|max-w|max-h|size|inset|inset-x|inset-y|top|right|bottom|left|start|end|translate-x|translate-y|scroll-m|scroll-mx|scroll-my|scroll-mt|scroll-mr|scroll-mb|scroll-ml|scroll-p|scroll-px|scroll-py|scroll-pt|scroll-pr|scroll-pb|scroll-pl|basis|indent';
const SPACING_RE = new RegExp(`^(?:${SPACING_PREFIX})-(\\d+(?:\\.\\d+)?)$`);
const SPACING_STEPS = new Set(['0', '0.5', '1', '1.5', '2', '2.5', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14', '16', '20', '24', '28', '32']);

const STATUS_TONES = 'success|warning|danger|info|neutral';
const TINT_AS_TEXT_RE = new RegExp(`^text-(?:${STATUS_TONES})-tint(?:/.+)?$`);
const INK_AS_FILL_RE = new RegExp(`^(?:bg|border${SIDE})-(?:${STATUS_TONES})-ink(?:/.+)?$`);
const DOT_AS_TEXT_RE = new RegExp(`^text-(?:${STATUS_TONES})-dot(?:/.+)?$`);
const MARKER_RE = /^(?:text|bg)-marker(?:\/.+)?$/;
const BRAND_RE = /^(?:text|bg|border)-brand(?:\/.+)?$/;
const MARKER_FILES = new Set(['src/components/marketing/ClosingBand.tsx', 'src/components/ui/Display.tsx', 'src/components/ui/Button.tsx', 'src/components/ui/classes.ts']);
const CLOSING_BAND = 'src/components/marketing/ClosingBand.tsx';
const OPACITY_TARGETS = new Set([
  'button', 'input', 'select', 'textarea', 'a',
  'Button', 'ButtonLink', 'IconButton', 'CopyButton', 'Field', 'Input', 'Textarea', 'AmountInput',
  'AddressInput', 'PublicKeyInput', 'Select', 'Combobox', 'Checkbox', 'Radio', 'RadioGroup', 'Switch',
  'DateInput', 'TimeInput', 'FileImport', 'SearchInput', 'RepeatableRows', 'ErrorSummary',
]);

const FONT_DISPLAY_OK = (file) => file === 'src/components/ui/Heading.tsx' || file === 'src/components/ui/Display.tsx' || file.startsWith('src/components/marketing/');
const FONT_MONO_FILES = new Set([
  'src/components/ui/Address.tsx', 'src/components/ui/Code.tsx', 'src/components/ui/Eyebrow.tsx',
  'src/components/ui/AddressInput.tsx', 'src/components/ui/PublicKeyInput.tsx', 'src/components/ui/TxLink.tsx',
  'src/components/ui/CopyField.tsx', 'src/components/marketing/NumberedFaq.tsx',
  'src/components/marketing/ClosingBand.tsx', 'src/components/layout/AppSidebar.tsx', 'src/components/ui/classes.ts',
]);

const OPACITY_TINT_RE = new RegExp(`^(?:${COLOR_PREFIX})${SIDE}-[a-zA-Z][\\w-]*/.+$`);
const TYPE_SIZE_RE = /^text-(?:xs|sm|base|lg|xl|[2-9]xl|display|headline|title-page|title-section|title-item|body-lg|body|small|label|caption|eyebrow|amount-xl|amount-lg|amount|mono|mono-sm)\//;
const PAREN_VAR_RE = /\((?:[a-z-]+:)?(--[\w-]+)\)/g;
const PAREN_VAR_OK = /^--(?:z|duration|pattern|safe)-/;

const STYLED_PRIMITIVES = new Set(['Button', 'ButtonLink', 'IconButton', 'Card', 'Panel', 'StatusPill', 'Input', 'Select', 'Textarea', 'Notice', 'Dialog']);
const PRIMITIVE_STYLE_RE = /^(?:bg|text|border|ring|outline|fill|stroke|shadow|rounded|font|leading|tracking|decoration|p|px|py|pt|pr|pb|pl|ps|pe)(?:-|$)|^(?:uppercase|lowercase|capitalize|italic|underline|border)$/;
const RAW_ELEMENTS = new Set(['button', 'input', 'select', 'textarea', 'table', 'dialog']);
const OVERLAY_FILES = new Set(['src/components/ui/Dialog.tsx', 'src/components/ui/Drawer.tsx']);
const LINK_TAGS = new Set(['Link', 'NavLink', 'a']);
const BUTTON_TAGS = new Set(['Button', 'IconButton', 'button', 'motion.button']);
const ICON_SIZES = new Set(['16', '20', '24']);
const NON_EMITTING_MARKERS = /^(?:group|peer)(?:\/[\w-]+)?$/;

const OBJECT_TEXT_KEYS = /^(?:label|title|description|message|text|word|helper|hint|placeholder|heading|cta|caption|summary|body|content|href|to|path|id|key|name|tone|icon|value|type|role|as|variant|size|kind|status|code|address|mobile|align|side|placement|aria[\w-]*)$/i;
const BARE_UTILITIES = new Set([
  'flex', 'grid', 'block', 'inline', 'inline-flex', 'inline-block', 'inline-grid', 'hidden', 'contents',
  'relative', 'absolute', 'fixed', 'sticky', 'static', 'underline', 'uppercase', 'italic', 'truncate',
  'border', 'rounded', 'shadow', 'transition', 'grow', 'shrink', 'isolate', 'sr-only', 'container',
]);

const FIX = {
  'no-raw-color': 'use a color token class (bg-surface, text-ink, border-line); only globals.css and styles/tokens.ts hold color values',
  'comment-hex': 'name the token in the comment instead of its hex value',
  'no-stock-palette': 'replace with a role token: ink, ink-secondary, ink-muted, line, sunken, or a status triple (success, warning, danger, info, neutral)',
  'no-arbitrary': 'use a named token (text-caption, max-w-reading, rounded-card); only --z-*, --duration-*, --pattern-* and --safe-* may be read in parentheses',
  'no-legacy-token': 'use the new token from the class migration map (text-ink, bg-sunken, rounded-card, text-small, z-(--z-menu), duration-(--duration-base))',
  'no-dead-class': 'this class emits no CSS; replace it with a token class or remove it',
  'spacing-step': 'use a spacing step from the scale (0.5 to 12, then 14, 16, 20, 24, 28, 32) or a named size',
  pair: 'text uses an -ink color, fills use -tint, marks use -dot; on the dark band use marker and ink-inverse; disabled controls use bg-sunken text-ink-muted, never opacity',
  'type-role': 'use Heading, Display, Eyebrow, Address or Code; sans is the default family',
  'icon-import': 'import icons through ui/Icon.tsx and use size 16, 20 or 24 with its default stroke',
  'data-state': 'write data-x={cond || undefined}, or use an ARIA state and its variant',
  motion: 'use transition-colors and the duration tokens; nothing moves on hover',
  'opacity-tint': 'use a tint token (bg-brand-soft, bg-success-tint) instead of an opacity modifier',
  'primitive-style': 'pass a variant or size prop instead; only layout utilities go in a primitive className',
  structure: 'use the primitive (Button, Input, Select, List, Dialog, ButtonLink, StatusPill, ConfirmDialog)',
};

const isUnder = (file, dirs) => dirs.some((d) => file.startsWith(d));

function splitTopLevel(token, separator) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of token) {
    if (ch === '[' || ch === '(') depth += 1;
    else if (ch === ']' || ch === ')') depth -= 1;
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

export function parseClassToken(raw) {
  const parts = splitTopLevel(raw, ':');
  let utility = parts.pop();
  const variants = parts;
  utility = utility.replace(/^!/, '').replace(/!$/, '');
  const negative = utility.startsWith('-');
  if (negative) utility = utility.slice(1);
  return { raw, utility, variants, negative };
}

function looksLikeClassList(text) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.some((t) => /^[A-Z]/.test(t) || /[,.?!;]$/.test(t) || /['"]/.test(t))) return false;
  return tokens.some((t) => t.includes('-') || t.includes(':')) || tokens.every((t) => BARE_UTILITIES.has(t));
}

function pieceFromLiteral(node, sf, flags = {}) {
  return { text: node.text, start: node.getStart(sf) + 1, partialStart: Boolean(flags.partialStart), partialEnd: Boolean(flags.partialEnd) };
}

function collectClassPieces(expr, sf, out) {
  if (!expr) return;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    out.push(pieceFromLiteral(expr, sf));
  } else if (ts.isTemplateExpression(expr)) {
    out.push(pieceFromLiteral(expr.head, sf, { partialEnd: true }));
    for (const span of expr.templateSpans) {
      collectClassPieces(span.expression, sf, out);
      out.push(pieceFromLiteral(span.literal, sf, { partialStart: true, partialEnd: ts.isTemplateMiddle(span.literal) }));
    }
  } else if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isSatisfiesExpression?.(expr) || ts.isNonNullExpression(expr)) {
    collectClassPieces(expr.expression, sf, out);
  } else if (ts.isConditionalExpression(expr)) {
    collectClassPieces(expr.whenTrue, sf, out);
    collectClassPieces(expr.whenFalse, sf, out);
  } else if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      collectClassPieces(expr.right, sf, out);
    } else if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.PlusToken) {
      collectClassPieces(expr.left, sf, out);
      collectClassPieces(expr.right, sf, out);
    }
  } else if (ts.isCallExpression(expr)) {
    const callee = expr.expression;
    if (ts.isIdentifier(callee) && CLASS_HELPERS.has(callee.text)) {
      for (const arg of expr.arguments) collectClassPieces(arg, sf, out);
    } else if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'join' && ts.isArrayLiteralExpression(callee.expression)) {
      for (const el of callee.expression.elements) collectClassPieces(el, sf, out);
    }
  } else if (ts.isArrayLiteralExpression(expr)) {
    for (const el of expr.elements) collectClassPieces(el, sf, out);
  } else if (ts.isTaggedTemplateExpression(expr) && ts.isIdentifier(expr.tag) && expr.tag.text === TW_TAG) {
    collectClassPieces(expr.template, sf, out);
  }
}

function tokensFromPieces(pieces) {
  const tokens = [];
  for (const piece of pieces) {
    const re = /\S+/g;
    let m;
    while ((m = re.exec(piece.text))) {
      const atStart = m.index === 0;
      const atEnd = m.index + m[0].length === piece.text.length;
      if ((piece.partialStart && atStart) || (piece.partialEnd && atEnd)) continue;
      tokens.push({ ...parseClassToken(m[0]), pos: piece.start + m.index });
    }
  }
  return tokens;
}

function primitiveImports(sf, file) {
  const names = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const spec = stmt.moduleSpecifier.text;
    const fromUi = /(?:^|\/)components\/ui\//.test(spec) || (file.startsWith('src/components/ui/') && spec.startsWith('./'));
    if (!fromUi || !stmt.importClause) continue;
    const clause = stmt.importClause;
    if (clause.name) names.set(clause.name.text, path.basename(spec));
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) names.set(el.name.text, (el.propertyName ?? el.name).text);
    }
  }
  return names;
}

function isStringish(type) {
  if ((type.flags & ts.TypeFlags.StringLike) !== 0) return true;
  return type.isUnion() && type.types.every((t) => (t.flags & ts.TypeFlags.StringLike) !== 0);
}

function typeIsStatus(type) {
  const alias = type.aliasSymbol;
  if (alias) {
    const decl = alias.declarations?.[0];
    const declFile = decl ? rel(decl.getSourceFile().fileName) : '';
    if (alias.name === 'StatusKey' && declFile === 'src/copy/status.ts') return true;
    if (/Status$/.test(alias.name) && declFile.startsWith('src/')) return true;
  }
  return false;
}

function typeHasFalse(type, checker) {
  const parts = type.isUnion() ? type.types : [type];
  return parts.some((t) => (t.flags & ts.TypeFlags.BooleanLiteral) !== 0 && checker.typeToString(t) === 'false');
}

function collectComments(sf, push) {
  const text = sf.getFullText();
  const seen = new Set();
  const take = (ranges) => {
    for (const r of ranges ?? []) {
      if (seen.has(r.pos)) continue;
      seen.add(r.pos);
      push(text.slice(r.pos, r.end), r.pos);
    }
  };
  const visit = (node) => {
    if (!ts.isJsxText(node)) {
      take(ts.getLeadingCommentRanges(text, node.pos));
      take(ts.getTrailingCommentRanges(text, node.end));
    }
    if (ts.isJsxExpression(node) && !node.expression) {
      const inner = text.slice(node.getStart(sf) + 1, node.end - 1);
      const offset = node.getStart(sf) + 1;
      const re = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
      let m;
      while ((m = re.exec(inner))) {
        if (!seen.has(offset + m.index)) {
          seen.add(offset + m.index);
          push(m[0], offset + m.index);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const HEX_RE = /(?<![\w&/#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const FUNC_COLOR_RE = /\b(?:rgba?|hsla?|oklch)\(/g;

function rawColorMatches(text) {
  const matches = [];
  for (const re of [HEX_RE, FUNC_COLOR_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const isShortDigits = re === HEX_RE && /^#\d{3,4}$/.test(m[0]);
      if (!isShortDigits) matches.push({ match: m[0], index: m.index });
    }
  }
  return matches;
}

function lintFile(sf, checker, ctx) {
  const file = rel(sf.fileName);
  const out = ctx.violations;
  const report = (rule, match, pos) => {
    const { line, col } = positionOf(sf, pos);
    out.push({ file, line, col, rule, match, fix: FIX[rule] });
  };
  const inPrimitiveDir = isUnder(file, PRIMITIVE_DIRS);
  const primitives = primitiveImports(sf, file);

  const checkTokens = (tokens, element) => {
    const utilities = new Set(tokens.filter((t) => t.variants.length === 0).map((t) => t.utility));
    if (element && utilities.has('fixed') && utilities.has('inset-0') && !OVERLAY_FILES.has(file)) {
      const t = tokens.find((x) => x.utility === 'fixed');
      report('structure', 'fixed inset-0', t.pos);
    }
    for (const t of tokens) {
      const { raw, utility, variants, pos } = t;
      if (raw.includes('${')) continue;
      if (STOCK_PALETTE_RE.test(utility)) report('no-stock-palette', raw, pos);
      if (raw.includes('[')) report('no-arbitrary', raw, pos);
      for (const m of raw.matchAll(PAREN_VAR_RE)) {
        if (!PAREN_VAR_OK.test(m[1])) report('no-arbitrary', raw, pos);
      }
      if (LEGACY_COLOR_RE.test(utility) || LEGACY_STOCK_RES.some((re) => re.test(utility))) report('no-legacy-token', raw, pos);
      const spacing = SPACING_RE.exec(utility);
      if (spacing && !SPACING_STEPS.has(spacing[1])) report('spacing-step', raw, pos);

      if (TINT_AS_TEXT_RE.test(utility) || INK_AS_FILL_RE.test(utility)) report('pair', raw, pos);
      if (DOT_AS_TEXT_RE.test(utility) && !file.startsWith('src/components/ui/')) report('pair', raw, pos);
      if (MARKER_RE.test(utility) && !MARKER_FILES.has(file)) report('pair', raw, pos);
      if (BRAND_RE.test(utility) && (file === CLOSING_BAND || element?.inInverse)) report('pair', raw, pos);
      if (/^opacity-/.test(utility) && element && OPACITY_TARGETS.has(element.tag)) report('pair', raw, pos);

      if (utility === 'font-display' && !FONT_DISPLAY_OK(file)) report('type-role', raw, pos);
      if (utility === 'font-mono' && !FONT_MONO_FILES.has(file)) report('type-role', raw, pos);
      if (utility === 'uppercase' && file !== 'src/components/ui/Eyebrow.tsx') report('type-role', raw, pos);
      if (utility === 'italic' && file !== 'src/components/ui/Display.tsx') report('type-role', raw, pos);

      const onHover = variants.includes('hover');
      if (
        utility === 'transition-all' ||
        (onHover && /^(?:translate-|scale-|shadow)/.test(utility)) ||
        /^(?:backdrop-)?blur(?:-|$)/.test(utility) ||
        utility === 'animate-ping' ||
        utility === 'animate-bounce'
      ) {
        report('motion', raw, pos);
      }

      if (OPACITY_TINT_RE.test(utility) && !TYPE_SIZE_RE.test(utility) && !utility.includes('[')) report('opacity-tint', raw, pos);

      if (element?.primitive && STYLED_PRIMITIVES.has(element.primitive) && PRIMITIVE_STYLE_RE.test(utility)) {
        report('primitive-style', raw, pos);
      }

      if (!NON_EMITTING_MARKERS.test(raw)) ctx.candidates.push({ file, raw, pos, sf });
    }
  };

  const elementInfo = (node, parentInverse) => {
    const tag = jsxTagName(node);
    const attrs = (ts.isJsxElement(node) ? node.openingElement : node).attributes.properties;
    let inverse = parentInverse;
    for (const attr of attrs) {
      if (!ts.isJsxAttribute(attr) || !/className$/i.test(jsxAttributeName(attr)) && jsxAttributeName(attr) !== 'class') continue;
      const pieces = [];
      const init = attr.initializer;
      if (init && ts.isStringLiteral(init)) pieces.push(pieceFromLiteral(init, sf));
      else if (init && ts.isJsxExpression(init)) collectClassPieces(init.expression, sf, pieces);
      if (tokensFromPieces(pieces).some((t) => t.utility === 'on-inverse')) inverse = true;
    }
    return { tag, inInverse: inverse, primitive: primitives.get(tag) ? tag : null, attrs };
  };

  const containsButton = (node) => {
    let found = null;
    const walk = (n) => {
      if (found) return;
      if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && BUTTON_TAGS.has(jsxTagName(n))) {
        found = n;
        return;
      }
      ts.forEachChild(n, walk);
    };
    for (const child of node.children) walk(child);
    return found;
  };

  const visit = (node, inverse, inClassAttr = false) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const element = elementInfo(node, inverse);
      const { tag, attrs } = element;

      if (RAW_ELEMENTS.has(tag) && !inPrimitiveDir) report('structure', `<${tag}>`, node.getStart(sf));
      if (ts.isJsxElement(node) && LINK_TAGS.has(tag)) {
        const button = containsButton(node);
        if (button) report('structure', `<${tag}> around <${jsxTagName(button)}>`, button.getStart(sf));
      }
      for (const attr of attrs) {
        if (!ts.isJsxAttribute(attr)) continue;
        const name = jsxAttributeName(attr);
        const init = attr.initializer;
        if (/className$/i.test(name) || name === 'class') {
          const pieces = [];
          if (init && ts.isStringLiteral(init)) pieces.push(pieceFromLiteral(init, sf));
          else if (init && ts.isJsxExpression(init)) collectClassPieces(init.expression, sf, pieces);
          checkTokens(tokensFromPieces(pieces), element);
        }
        if (name.startsWith('data-') && init && ts.isJsxExpression(init) && init.expression) {
          if (typeHasFalse(checker.getTypeAtLocation(init.expression), checker)) report('data-state', `${name}={${init.expression.getText(sf)}}`, attr.getStart(sf));
        }
        if (name === 'strokeWidth' && file !== 'src/components/ui/Icon.tsx') report('icon-import', 'strokeWidth', attr.getStart(sf));
        if (name === 'size' && tag === 'Icon' && init) {
          const value = ts.isStringLiteral(init) ? init.text : init.expression && ts.isNumericLiteral(init.expression) ? init.expression.text : null;
          if (value !== null && !ICON_SIZES.has(value)) report('icon-import', `size={${value}}`, attr.getStart(sf));
        }
        if (name === 'whileHover' && tag.startsWith('motion.')) report('structure', `<${tag} whileHover>`, attr.getStart(sf));
        if (name === 'style' && init && !inPrimitiveDir && init.getText(sf).includes('var(--')) report('structure', 'style with var(--', attr.getStart(sf));
        if (init) visit(init, element.inInverse, /className$/i.test(name) || name === 'class');
      }
      for (const attr of attrs) {
        if (ts.isJsxSpreadAttribute(attr)) visit(attr.expression, element.inInverse);
      }
      if (ts.isJsxElement(node)) {
        for (const child of node.children) visit(child, element.inInverse);
      }
      return;
    }

    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const expr = node.expression;
      const type = checker.getTypeAtLocation(expr);
      const isStatusField = ts.isPropertyAccessExpression(expr) && expr.name.text === 'status' && isStringish(type);
      if (typeIsStatus(type) || isStatusField) report('structure', `{${expr.getText(sf)}}`, expr.getStart(sf));
    }

    if (!inClassAttr && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CLASS_HELPERS.has(node.expression.text)) {
      const pieces = [];
      collectClassPieces(node, sf, pieces);
      checkTokens(tokensFromPieces(pieces), null);
      return;
    }
    if (!inClassAttr && ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === TW_TAG) {
      const pieces = [];
      collectClassPieces(node.template, sf, pieces);
      checkTokens(tokensFromPieces(pieces), null);
      return;
    }
    if (!inClassAttr && inPrimitiveDir && ts.isPropertyAssignment(node) && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))) {
      const key = node.name.getText(sf).replace(/^['"]|['"]$/g, '');
      if (!OBJECT_TEXT_KEYS.test(key) && looksLikeClassList(node.initializer.text)) {
        checkTokens(tokensFromPieces([pieceFromLiteral(node.initializer, sf)]), null);
      }
    }

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /^lucide-react(?:\/|$)/.test(node.moduleSpecifier.text)) {
      const typeOnly = node.importClause?.isTypeOnly;
      if (!typeOnly && file !== 'src/components/ui/Icon.tsx' && file !== 'src/copy/nav.ts') report('icon-import', node.moduleSpecifier.text, node.getStart(sf));
    }

    if (ts.isPropertyAccessExpression(node) && ['confirm', 'alert'].includes(node.name.text) && ['window', 'globalThis'].includes(node.expression.getText(sf))) {
      report('structure', node.getText(sf), node.getStart(sf));
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['confirm', 'alert'].includes(node.expression.text)) {
      const decl = checker.getSymbolAtLocation(node.expression)?.declarations?.[0];
      if (decl && decl.getSourceFile().isDeclarationFile && decl.getSourceFile().fileName.includes('/typescript/lib/')) {
        report('structure', `${node.expression.text}()`, node.getStart(sf));
      }
    }

    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) && !RAW_COLOR_ALLOWED.has(file)) {
      const text = ts.isJsxText(node) ? node.getText(sf) : node.text;
      const offset = ts.isJsxText(node) ? node.getStart(sf) : node.getStart(sf) + 1;
      for (const m of rawColorMatches(text)) report('no-raw-color', m.match, offset + m.index);
    }

    ts.forEachChild(node, (child) => visit(child, inverse, inClassAttr));
  };

  visit(sf, false);

  collectComments(sf, (comment, pos) => {
    for (const m of rawColorMatches(comment)) {
      if (m.match.startsWith('#')) report('comment-hex', m.match, pos + m.index);
    }
  });
}

function lintCssFiles(ctx) {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.css')) {
        const file = rel(full);
        if (RAW_COLOR_ALLOWED.has(file)) continue;
        const text = fs.readFileSync(full, 'utf8');
        for (const m of rawColorMatches(text)) {
          const { line, col } = lineColAt(text, m.index);
          ctx.violations.push({ file, line, col, rule: 'no-raw-color', match: m.match, fix: FIX['no-raw-color'] });
        }
      }
    }
  };
  walk(SRC_DIR);
}

async function makeEmitChecker() {
  const tailwindCss = path.join(FRONTEND_DIR, 'node_modules', 'tailwindcss', 'index.css');
  const globalsPath = path.join(SRC_DIR, 'styles', 'globals.css');
  const globals = fs.readFileSync(globalsPath, 'utf8');
  const loadStylesheet = async (id, base) => {
    if (id === 'tailwindcss') {
      return { path: tailwindCss, base: path.dirname(tailwindCss), content: fs.readFileSync(tailwindCss, 'utf8') };
    }
    const resolved = path.resolve(base, id);
    return { path: resolved, base: path.dirname(resolved), content: fs.readFileSync(resolved, 'utf8') };
  };
  const fresh = () => compile(globals, { base: path.dirname(globalsPath), loadStylesheet });
  const baseLength = (await fresh()).build([]).length;
  const cache = new Map();
  return async (candidate) => {
    if (cache.has(candidate)) return cache.get(candidate);
    const compiler = await fresh();
    const emits = compiler.build([candidate]).length !== baseLength;
    cache.set(candidate, emits);
    return emits;
  };
}

export async function runDesignLint() {
  const program = getProgram();
  const checker = program.getTypeChecker();
  const ctx = { violations: [], candidates: [] };
  for (const sf of sourceFilesUnderSrc(program)) lintFile(sf, checker, ctx);
  lintCssFiles(ctx);

  const emits = await makeEmitChecker();
  for (const c of ctx.candidates) {
    if (!(await emits(c.raw))) {
      const { line, col } = positionOf(c.sf, c.pos);
      ctx.violations.push({ file: c.file, line, col, rule: 'no-dead-class', match: c.raw, fix: FIX['no-dead-class'] });
    }
  }

  return ctx.violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col || a.rule.localeCompare(b.rule));
}

if (isMain(import.meta.url)) {
  await runLintCli({ name: 'design-lint', run: runDesignLint });
}
