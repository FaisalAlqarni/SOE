/**
 * lib/capability-scan.js — cross-plugin capability discovery (design §6).
 *
 * soe is a HOST orchestrator: it uses whatever any installed plugin provides.
 * At run start a "capability scan" builds a `role → best-provider` map from the
 * skills/agents installed across plugins, so role-based routing can prefer the
 * best-matching installed specialist (a Go reviewer from ECC, a Flutter reviewer
 * from soe-extras, AgentShield, ...) and FALL BACK to soe-core's generic when
 * none exists. Packs are purely additive; core never hard-depends on them.
 *
 * There are two matching strategies and a strict ranking rule between them:
 *
 *   (1) TAGGED / PRECISE — a provider that declares an explicit `role:` or
 *       `domain:` tag is routed EXACTLY to that role. This is authoritative:
 *       it is the "optional tag convention" that gives precise routing.
 *   (2) UNTAGGED / BEST-EFFORT — a provider with no tag is routed by scanning
 *       its name + description for role KEYWORDS (best-effort description
 *       matching for non-conforming plugins).
 *
 *   RANKING RULE: within a role, a TAGGED match always outranks a KEYWORD-only
 *   match. `resolveRole` therefore returns the tagged specialist over one merely
 *   inferred from prose. Among same-strategy candidates, order is stable (input
 *   order preserved) so results are deterministic.
 *
 * DESIGN SPLIT (unit-testability):
 *   - `buildCapabilityMap(providers)` / `resolveRole(map, role)` are a PURE core
 *     over a provider ARRAY — no fs, no I/O — so they can be tested in isolation.
 *   - `enumerateProviders(dirs)` is a THIN, separate fs helper that reads real
 *     `skills/<x>/SKILL.md` + `agents/<y>.md` frontmatter into that same
 *     provider array. It is the only part that touches the filesystem.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Role keyword table for BEST-EFFORT matching of untagged providers.
 *
 * Each role maps to the keyword tokens that imply it. Matching is token-based
 * (word-boundary) against the lowercased `name + description`, so short tokens
 * like "go" don't spuriously match inside "algorithm". More specific roles are
 * intentionally distinct so a provider can be routed to several roles if its
 * prose genuinely spans them (e.g. "security review").
 *
 * @type {Record<string, string[]>}
 */
const ROLE_KEYWORDS = {
  'code-review': ['review', 'reviewer', 'code-review'],
  security: ['security', 'vulnerability', 'vulnerabilities', 'auth', 'authz', 'agentshield'],
  testing: ['test', 'tests', 'testing', 'e2e', 'end-to-end', 'end to end', 'tdd'],
  go: ['go', 'golang'],
  python: ['python', 'pytest', 'django'],
  rust: ['rust', 'cargo'],
  java: ['java', 'spring', 'springboot'],
  ruby: ['ruby', 'rails'],
  dart: ['dart'],
  flutter: ['flutter'],
  frontend: ['frontend', 'react', 'vue', 'svelte', 'ui'],
  logging: ['logging', 'logs', 'observability'],
  docs: ['docs', 'documentation'],
  performance: ['performance', 'perf', 'benchmark', 'profiling'],
};

/** Normalize a value to a trimmed non-empty string, else ''. */
function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Build the ordered set of keyword roles a provider matches, by scanning its
 * name + description for the ROLE_KEYWORDS tokens (word-boundary aware).
 *
 * @param {{name?: string, description?: string}} provider
 * @returns {string[]} matched role keys (may be empty)
 */
function keywordRoles(provider) {
  const haystack = `${str(provider.name)} ${str(provider.description)}`.toLowerCase();
  if (!haystack.trim()) return [];

  const roles = [];
  for (const [role, tokens] of Object.entries(ROLE_KEYWORDS)) {
    const hit = tokens.some((token) => {
      // Escape regex metachars, then require word boundaries so "go" matches
      // "go"/"golang"? — no: "golang" is a separate token. Multi-word tokens
      // ("end to end") are matched with spaces intact.
      const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(haystack);
    });
    if (hit) roles.push(role);
  }
  return roles;
}

/**
 * Build a `role → [providers]` capability map from a provider ARRAY (PURE).
 *
 * Each input descriptor is `{ name, description, role?, domain?, kind? }`
 * (kind = 'skill' | 'agent'). Providers carrying a `role:`/`domain:` tag are
 * routed PRECISELY to that role; untagged providers are routed BEST-EFFORT by
 * keyword. Within each role, tagged matches are ranked ahead of keyword matches.
 *
 * The returned providers are shallow clones annotated with `match: 'tag' |
 * 'keyword'` so callers (and ranking) can tell precise routing from inferred.
 *
 * @param {Array<{name?:string, description?:string, role?:string, domain?:string, kind?:string}>} providers
 * @returns {Map<string, Array<object>>}
 */
function buildCapabilityMap(providers) {
  /** @type {Map<string, {tag: object[], keyword: object[]}>} */
  const buckets = new Map();

  const push = (role, provider, match) => {
    const key = str(role);
    if (!key) return;
    if (!buckets.has(key)) buckets.set(key, { tag: [], keyword: [] });
    buckets.get(key)[match].push({ ...provider, role: key, match });
  };

  if (Array.isArray(providers)) {
    for (const provider of providers) {
      if (!provider || typeof provider !== 'object') continue;

      const tag = str(provider.role) || str(provider.domain);
      if (tag) {
        // TAGGED / PRECISE — authoritative, exact role.
        push(tag, provider, 'tag');
      } else {
        // UNTAGGED / BEST-EFFORT — one bucket per matched keyword role.
        for (const role of keywordRoles(provider)) {
          push(role, provider, 'keyword');
        }
      }
    }
  }

  // Materialize: tagged providers first (higher rank), then keyword ones.
  const map = new Map();
  for (const [role, { tag, keyword }] of buckets) {
    map.set(role, [...tag, ...keyword]);
  }
  return map;
}

/**
 * Return the best (highest-ranked) provider for a role, or null if none.
 *
 * "Best" = first entry, which is the ranking established by buildCapabilityMap
 * (tagged/precise ahead of keyword-only, input order preserved within a tier).
 *
 * @param {Map<string, Array<object>>} map
 * @param {string} role
 * @returns {object|null}
 */
function resolveRole(map, role) {
  if (!(map instanceof Map)) return null;
  const providers = map.get(str(role));
  return providers && providers.length ? providers[0] : null;
}

// ---------------------------------------------------------------------------
// Thin fs helper — separate from the pure core above.
// ---------------------------------------------------------------------------

/**
 * Parse the leading YAML frontmatter of a markdown file for the few keys we
 * route on: name, description, role, domain. Returns {} on any error.
 *
 * @param {string} filePath
 * @returns {{name?:string, description?:string, role?:string, domain?:string}}
 */
function readFrontmatter(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return {};
  }

  const lines = content.split('\n');
  const out = {};
  let inFm = false;

  for (const line of lines) {
    if (line.trim() === '---') {
      if (inFm) break; // end of frontmatter
      inFm = true;
      continue;
    }
    if (!inFm) continue;
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].trim().replace(/^["'](.*)["']$/, '$1');
    if (['name', 'description', 'role', 'domain'].includes(key)) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Enumerate providers from one or more plugin directories (THIN fs helper).
 *
 * For each dir it reads `skills/<x>/SKILL.md` (kind='skill') and `agents/<y>.md`
 * (kind='agent') frontmatter into `{ name, description, role?, domain?, kind }`
 * descriptors — exactly the shape `buildCapabilityMap` consumes. Missing dirs
 * are skipped silently. Providers without a parsed name are dropped.
 *
 * @param {string[]} dirs
 * @returns {Array<{name:string, description:string, role?:string, domain?:string, kind:string}>}
 */
function enumerateProviders(dirs) {
  if (!Array.isArray(dirs)) return [];
  const providers = [];

  for (const dir of dirs) {
    if (typeof dir !== 'string' || !dir) continue;

    // skills/<x>/SKILL.md
    const skillsDir = path.join(dir, 'skills');
    if (isDir(skillsDir)) {
      for (const entry of safeReaddir(skillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
        if (!fs.existsSync(skillFile)) continue;
        const fm = readFrontmatter(skillFile);
        const name = str(fm.name) || entry.name;
        if (name) providers.push({ ...fm, name, description: str(fm.description), kind: 'skill' });
      }
    }

    // agents/<y>.md
    const agentsDir = path.join(dir, 'agents');
    if (isDir(agentsDir)) {
      for (const entry of safeReaddir(agentsDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const fm = readFrontmatter(path.join(agentsDir, entry.name));
        const name = str(fm.name) || entry.name.replace(/\.md$/, '');
        if (name) providers.push({ ...fm, name, description: str(fm.description), kind: 'agent' });
      }
    }
  }

  return providers;
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function safeReaddir(p, opts) {
  try {
    return fs.readdirSync(p, opts);
  } catch {
    return [];
  }
}

export { buildCapabilityMap, resolveRole, enumerateProviders };
