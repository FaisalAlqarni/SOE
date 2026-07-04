/**
 * lib/risk-matrix.js — the deterministic, rule-based risk FLOOR
 * (design §4 fail-safe scrutiny, resolution F16).
 *
 * This is the integrity-preserving floor for ceremony right-sizing. Right-sizing
 * may only LOWER scrutiny on deterministically-verified-safe work — so the code
 * that decides "safe" must itself be real, tested code, NOT an LLM's discretion.
 *
 * `classify(diff)` scans a change for HIGH-RISK markers (auth, authz, payment,
 * crypto, secrets, SQL/migrations, destructive deletions, PII, prod config,
 * force-push, security-sensitive paths) and for size (> LOC threshold). ANY hit
 * pins the floor to 'full' (full board + thorough review). A docs-only / tiny
 * non-risky diff is 'trivial'; everything else is 'standard'.
 *
 * `applyClassifierHint(floor, hint)` lets an LLM classifier only RAISE the tier
 * above the deterministic floor — it can NEVER lower it. Downscoping is therefore
 * possible only when no risk signal fired.
 *
 * `blastRadius(files, graphify)` is an OPTIONAL graph-impact hook: when a graphify
 * provider is supplied and reports a large or security-path-touching dependency
 * reach, it returns a signal that raises the tier to 'full' even if the diff looks
 * small. When graphify is absent (null/undefined) — or the provider throws — it
 * fails safe: returns null (no-op) and never throws, so the path/marker rules
 * remain the floor.
 *
 * This module is PURE: no fs, no I/O, no LLM. The caller (lib/scrutiny.js, P3.6)
 * owns routing, logging every downscope, and persistence.
 *
 * -------------------------------------------------------------------------
 * PRIMARY diff shape (the well-supported, documented input):
 *
 *   { files: [ { path: string, linesChanged: number, content?: string }, ... ] }
 *
 * A unified-diff STRING is ALSO accepted; it is parsed into that same shape —
 * `path` from the `+++ b/…` headers, `linesChanged` from added+removed body
 * lines, and `content` from the ADDED (`+`) lines only (so a line that a diff
 * REMOVES cannot fire a content marker).
 * -------------------------------------------------------------------------
 */

/** The tier vocabulary, ordered least → most scrutiny: trivial < standard < full. */
export const TIERS = Object.freeze(['trivial', 'standard', 'full']);

const TIER_RANK = Object.freeze(
  TIERS.reduce((acc, t, i) => ((acc[t] = i), acc), {}),
);

/** Documentation / non-code extensions — a diff of ONLY these is docs-only. */
const DOC_EXTENSIONS = /\.(md|mdx|markdown|txt|rst|adoc)$/i;
const DOC_PATHS = /(^|\/)(docs?|license|licenses|notice|readme|changelog|contributing|authors|codeowners)($|[./])/i;

/**
 * HIGH-RISK markers. Each has a `path` regex (tested against the file path) and/or
 * a `content` regex (tested against ADDED content). A match on EITHER fires the
 * marker and pins the floor to 'full'. Marker names are the stable signal labels
 * surfaced in the returned `markers` array.
 */
const MARKERS = [
  {
    name: 'auth',
    path: /(^|\/)(auth|login|logout|signin|signup|session|oauth|sso|saml|jwt)([./_-]|$)/i,
    content: /\b(authenticat\w*|login|logout|sign[_-]?in|jwt|oauth|passwordHash|bcrypt)\b/i,
  },
  {
    name: 'authz',
    path: /(^|\/)(authz|authoriz\w*|permission|permissions|rbac|acl|roles?|policy|policies|guard)([./_-]|$)/i,
    content: /\b(authoriz\w*|permission|hasPermission|isAllowed|rbac|require[_-]?role|access[_-]?control)\b/i,
  },
  {
    name: 'payment',
    path: /(^|\/)(payment|payments|billing|charge|checkout|invoice|invoices|stripe|paypal|braintree|refund)([./_-]|$)/i,
    content: /\b(charge|refund|stripe|paypal|creditCard|card[_-]?number|payment[_-]?intent)\b/i,
  },
  {
    name: 'crypto',
    path: /(^|\/)(crypto|cipher|encrypt\w*|decrypt\w*|keystore|keypair)([./_-]|$)/i,
    content: /\b(crypto\.\w+|createHmac|createCipher\w*|randomBytes|pbkdf2|scrypt|aes[_-]?\d|rsa)\b/i,
  },
  {
    name: 'secrets',
    // paths: .env* files, anything under a secrets/ dir, credential/token stores.
    path: /(^|\/)(\.env($|\.\w+)|secrets?|credentials?|\.pem$|\.key$|id_rsa|token(s)?\.json)/i,
    content: /\b(secret|api[_-]?key|apikey|access[_-]?token|private[_-]?key|client[_-]?secret|password\s*=)\b/i,
  },
  {
    name: 'migrations',
    // SQL files AND anything under a migrations/ directory.
    path: /(^|\/)(migrations?|migrate)(\/|$)|\.sql$/i,
    content: /\b(ALTER\s+TABLE|CREATE\s+TABLE|CREATE\s+INDEX|INSERT\s+INTO|UPDATE\s+\w+\s+SET)\b/i,
  },
  {
    name: 'deletion',
    // destructive: schema drops / row deletes / recursive fs removal.
    content: /\b(DROP\s+(TABLE|DATABASE|SCHEMA|COLUMN)|TRUNCATE\s+TABLE|DELETE\s+FROM|rm\s+-rf)\b/i,
  },
  {
    name: 'pii',
    path: /(^|\/)(pii|gdpr|personal[_-]?data)([./_-]|$)/i,
    content: /\b(ssn|socialSecurity\w*|passport[_-]?number|dateOfBirth|creditCard|nationalId|taxId)\b/i,
  },
  {
    name: 'prod-config',
    path: /(^|\/|[._-])(prod|production)([._-]|\/|$).*\.(ya?ml|json|toml|ini|conf|env|tf|properties)$|(^|\/)(prod|production)\.(ya?ml|json|toml|ini|conf|env|tf|properties)$/i,
    content: /\b(NODE_ENV\s*=\s*production|environment:\s*production)\b/i,
  },
  {
    name: 'force-push',
    content: /git\s+push\s+(-\S*f\S*|--force(-with-lease)?)\b|push\s+--force/i,
  },
];

/**
 * Normalize any accepted input into the primary structured shape.
 * @param {object|string} diff
 * @returns {{ files: Array<{path:string, linesChanged:number, content:string}> }}
 */
function normalizeDiff(diff) {
  if (typeof diff === 'string') {
    return { files: parseUnifiedDiff(diff) };
  }
  if (diff && typeof diff === 'object' && Array.isArray(diff.files)) {
    const files = diff.files.map((f) => {
      if (!f || typeof f !== 'object' || typeof f.path !== 'string') {
        throw new Error('classify: each file must be { path, linesChanged, content? }');
      }
      return {
        path: f.path,
        linesChanged: Number.isFinite(f.linesChanged) ? f.linesChanged : 0,
        content: typeof f.content === 'string' ? f.content : '',
      };
    });
    return { files };
  }
  throw new Error(
    'classify: diff must be a unified-diff string or { files: [{ path, linesChanged, content? }] }',
  );
}

/**
 * Parse a unified diff into the structured file shape. `path` comes from the
 * `+++ b/…` header; `linesChanged` counts added + removed body lines; `content`
 * is the concatenation of ADDED (`+`, excluding the `+++` header) lines only.
 * @param {string} text
 * @returns {Array<{path:string, linesChanged:number, content:string}>}
 */
function parseUnifiedDiff(text) {
  const files = [];
  let cur = null;
  const push = () => {
    if (cur) files.push(cur);
  };

  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git') || line.startsWith('+++ ')) {
      if (line.startsWith('+++ ')) {
        // "+++ b/path" (or "+++ /dev/null")
        const raw = line.slice(4).trim().replace(/^b\//, '');
        if (cur && cur.path === null) {
          cur.path = raw;
        } else {
          push();
          cur = { path: raw, linesChanged: 0, content: '' };
        }
      } else {
        // new "diff --git a/x b/x" block
        push();
        cur = { path: null, linesChanged: 0, content: '' };
      }
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('--- ') || line.startsWith('@@')) continue;
    if (line.startsWith('+')) {
      cur.linesChanged += 1;
      cur.content += line.slice(1) + '\n';
    } else if (line.startsWith('-')) {
      cur.linesChanged += 1;
    }
  }
  push();
  // Drop any block that never resolved a path (defensive).
  return files.filter((f) => f.path);
}

/** True when EVERY file in the diff is documentation / non-code. */
function isDocsOnly(files) {
  if (files.length === 0) return false;
  return files.every(
    (f) => DOC_EXTENSIONS.test(f.path) || DOC_PATHS.test(f.path),
  );
}

/**
 * Classify a diff into a deterministic risk tier + the markers that fired.
 *
 * Returns floor 'full' when the diff touches ANY high-risk marker (auth, authz,
 * payment, crypto, secrets, SQL/migrations, destructive deletion, PII, prod
 * config, force-push, security-sensitive path) OR total lines changed exceeds
 * `locThreshold`. Returns 'trivial' for a docs-only / tiny non-risky diff, and
 * 'standard' otherwise.
 *
 * @param {object|string} diff - Structured `{ files }` (primary) or a unified-diff string.
 * @param {{ locThreshold?: number }} [opts]
 * @returns {{ tier: 'trivial'|'standard'|'full', markers: string[] }}
 * @throws {Error} If `diff` is neither an accepted object nor a string.
 */
export function classify(diff, { locThreshold = 300 } = {}) {
  const { files } = normalizeDiff(diff);

  const fired = new Set();

  let totalLoc = 0;
  for (const f of files) {
    totalLoc += f.linesChanged || 0;
    for (const marker of MARKERS) {
      if (fired.has(marker.name)) continue;
      const pathHit = marker.path && marker.path.test(f.path);
      const contentHit = marker.content && f.content && marker.content.test(f.content);
      if (pathHit || contentHit) fired.add(marker.name);
    }
  }

  if (totalLoc > locThreshold) fired.add('loc');

  // Emit markers in a stable order: declared marker order, then 'loc'.
  const markers = [
    ...MARKERS.map((m) => m.name).filter((n) => fired.has(n)),
    ...(fired.has('loc') ? ['loc'] : []),
  ];

  if (markers.length > 0) {
    return { tier: 'full', markers };
  }

  if (isDocsOnly(files) || files.length === 0) {
    return { tier: 'trivial', markers: [] };
  }

  return { tier: 'standard', markers: [] };
}

/**
 * Apply an LLM classifier hint to a deterministic floor. The hint may only RAISE
 * the tier above the floor — it can NEVER lower it. An absent (null/undefined)
 * hint keeps the floor unchanged.
 *
 * @param {'trivial'|'standard'|'full'} floor - The deterministic floor from classify().
 * @param {'trivial'|'standard'|'full'|null|undefined} hint - The classifier's suggestion.
 * @returns {'trivial'|'standard'|'full'} max(floor, hint).
 * @throws {Error} If `floor`, or a non-nullish `hint`, is not a valid tier.
 */
export function applyClassifierHint(floor, hint) {
  if (!(floor in TIER_RANK)) {
    throw new Error(`applyClassifierHint: invalid floor tier '${floor}'`);
  }
  if (hint === undefined || hint === null) return floor;
  if (!(hint in TIER_RANK)) {
    throw new Error(`applyClassifierHint: invalid hint tier '${hint}'`);
  }
  return TIER_RANK[hint] > TIER_RANK[floor] ? hint : floor;
}

/**
 * Optional graphify blast-radius hook. When a graphify provider is supplied,
 * query the real dependency impact of the changed files; a LARGE impact (more
 * than `impactThreshold` reached files) or a SECURITY-path-touching impact
 * returns a signal that raises the tier to 'full'. When graphify is absent
 * (null/undefined) this is a silent no-op (returns null) so the path/marker rules
 * remain the floor. A broken/throwing provider also fails safe (returns null).
 *
 * The provider contract (duck-typed; graphify's MCP `get_pr_impact`):
 *   graphify.getPrImpact(files) -> { impactedCount, impactedFiles?, touchesSecurityPath? }
 *
 * @param {string[]} files - Changed file paths.
 * @param {object|null|undefined} graphify - Provider, or absent for no-op.
 * @param {{ impactThreshold?: number }} [opts]
 * @returns {{ raiseTo: 'full', reason: string } | null}
 */
export function blastRadius(files, graphify, { impactThreshold = 25 } = {}) {
  if (!graphify || typeof graphify.getPrImpact !== 'function') return null;

  let impact;
  try {
    impact = graphify.getPrImpact(files);
  } catch {
    // Provider is down or broke — fail safe to path/marker rules.
    return null;
  }
  if (!impact || typeof impact !== 'object') return null;

  const count = Number.isFinite(impact.impactedCount) ? impact.impactedCount : 0;

  if (impact.touchesSecurityPath) {
    return { raiseTo: 'full', reason: 'blast-radius touches a security-sensitive path' };
  }
  if (count > impactThreshold) {
    return {
      raiseTo: 'full',
      reason: `large blast-radius: ${count} files impacted (> ${impactThreshold})`,
    };
  }
  return null;
}
