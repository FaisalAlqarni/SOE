#!/usr/bin/env bash
#
# reference-integrity.sh — guard the skills/, agents/, and commands/ trees
# against two classes of broken cross-references:
#
#   (a) Dangling refs: any `soe:<name>` token (pattern `soe:[a-z0-9-]+`)
#       whose <name> does not match an existing skill, agent, or command.
#       Existing names are derived from:
#         - skills/*    -> directory name under any skills/ tree
#         - agents/*.md -> file basename minus the .md extension
#         - commands/*.md -> file basename minus the .md extension
#
#   (b) Residual old-namespace: any occurrence (case-insensitive) of an
#       un-rewritten legacy prefix — `superpowers:`, `supaconductor:`,
#       `orchestrator-supaconductor:`, or `sp-ecc:` — anywhere in the trees.
#
# Usage:
#   bash tests/reference-integrity.sh [DIR]
#
# With no argument, scans the real skills/, agents/, and commands/ trees.
# With a DIR argument, scans DIR (recursively) — used to point the checker
# at a fixture directory for self-testing.
#
# Prints clear FAIL lines. Exits non-zero if any check fails; exits 0 when
# clean — including when the trees are empty or absent.

set -u

# Resolve repo root as the parent of this script's directory so the
# default (no-arg) scan works regardless of the caller's cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Legacy prefixes that must never survive the mass-import/rename phases.
OLD_NAMESPACES=(
  'superpowers:'
  'supaconductor:'
  'orchestrator-supaconductor:'
  'sp-ecc:'
)

# ---------------------------------------------------------------------------
# Determine scan roots.
#   - With no argument: scan ONLY the real top-level skills/, agents/, and
#     commands/ trees under the repo root. We deliberately do NOT recurse
#     hunting for those directory names, so test fixtures living under
#     tests/fixtures/ are never picked up by the default run.
#   - With a DIR argument: treat DIR as a synthetic repo root and look for
#     skills/, agents/, commands/ subtrees ANYWHERE beneath it. This lets a
#     fixture nest them under dirty/ or clean/. Only reachable when a DIR is
#     given explicitly, so the default run is unaffected.
# ---------------------------------------------------------------------------
skills_roots=()
agents_roots=()
commands_roots=()

if [ "$#" -ge 1 ]; then
  if [ ! -d "$1" ]; then
    echo "FAIL: directory not found: ${1}" >&2
    exit 2
  fi
  BASE="$(cd "$1" && pwd)"
  scan_label="$1"

  # Recursively collect any skills/ agents/ commands/ subtree beneath BASE.
  while IFS= read -r -d '' d; do skills_roots+=("$d"); done \
    < <(find "$BASE" -type d -name skills -print0 2>/dev/null)
  while IFS= read -r -d '' d; do agents_roots+=("$d"); done \
    < <(find "$BASE" -type d -name agents -print0 2>/dev/null)
  while IFS= read -r -d '' d; do commands_roots+=("$d"); done \
    < <(find "$BASE" -type d -name commands -print0 2>/dev/null)
else
  scan_label="skills/, agents/, and commands/"

  # Only the real top-level trees — no recursive name hunting.
  [ -d "${ROOT_DIR}/skills" ]   && skills_roots+=("${ROOT_DIR}/skills")
  [ -d "${ROOT_DIR}/agents" ]   && agents_roots+=("${ROOT_DIR}/agents")
  [ -d "${ROOT_DIR}/commands" ] && commands_roots+=("${ROOT_DIR}/commands")
fi

# All roots to scan file *contents* over (for tokens / residual prefixes).
all_roots=("${skills_roots[@]}" "${agents_roots[@]}" "${commands_roots[@]}")

# ---------------------------------------------------------------------------
# Build the set of existing names.
# ---------------------------------------------------------------------------
declare -A EXISTING

# Skills: immediate subdirectory names under each skills/ root.
for r in "${skills_roots[@]:-}"; do
  [ -n "$r" ] || continue
  while IFS= read -r -d '' d; do
    EXISTING["$(basename "$d")"]=1
  done < <(find "$r" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null)
done

# Agents & commands: *.md basenames (minus extension) under each root.
for r in "${agents_roots[@]:-}" "${commands_roots[@]:-}"; do
  [ -n "$r" ] || continue
  while IFS= read -r -d '' f; do
    b="$(basename "$f")"
    EXISTING["${b%.md}"]=1
  done < <(find "$r" -type f -name '*.md' -print0 2>/dev/null)
done

# ---------------------------------------------------------------------------
# Gather all files whose contents we must inspect.
# ---------------------------------------------------------------------------
files=()
for r in "${all_roots[@]:-}"; do
  [ -n "$r" ] || continue
  while IFS= read -r -d '' f; do
    files+=("$f")
  done < <(find "$r" -type f -print0 2>/dev/null)
done

if [ "${#files[@]}" -eq 0 ]; then
  echo "No skills/agents/commands files found under ${scan_label} (nothing to check)."
  exit 0
fi

exit_code=0

# ---------------------------------------------------------------------------
# Check (a): dangling soe:<name> refs.
# ---------------------------------------------------------------------------
# Extract every soe:<name> occurrence with its file:line for good messages.
while IFS= read -r line; do
  [ -n "$line" ] || continue
  # line looks like: <file>:<lineno>:soe:<name>
  loc="${line%%:soe:*}"          # <file>:<lineno>
  name="${line##*:soe:}"          # <name>
  if [ -z "${EXISTING[$name]:-}" ]; then
    echo "FAIL dangling ref: soe:${name} (no such skill/agent/command) at ${loc}"
    exit_code=1
  fi
done < <(grep -rHno -E 'soe:[a-z0-9-]+' "${files[@]}" 2>/dev/null \
           | sed -E 's/(.*:[0-9]+):.*(soe:[a-z0-9-]+).*/\1:\2/')

# ---------------------------------------------------------------------------
# Check (b): residual old-namespace prefixes (case-insensitive).
# ---------------------------------------------------------------------------
for prefix in "${OLD_NAMESPACES[@]}"; do
  # Escape regex metacharacter '-' is fine inside grep -F, but we want a
  # literal match; use fixed-string, case-insensitive grep.
  while IFS= read -r hit; do
    [ -n "$hit" ] || continue
    echo "FAIL residual old-namespace: '${prefix}' at ${hit}"
    exit_code=1
  done < <(grep -rHnoi -F "$prefix" "${files[@]}" 2>/dev/null \
             | sed -E 's/(:[0-9]+):.*/\1/')
done

if [ "$exit_code" -eq 0 ]; then
  echo "OK: no dangling soe: refs and no residual old-namespace tokens under ${scan_label}."
fi

exit "$exit_code"
