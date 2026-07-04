#!/usr/bin/env bash
#
# bundled-exec-audit.sh — supply-chain audit + release gate for every
# executable script shipped inside the soe plugin (design §9/§12).
#
# It does three things:
#
#   1. ENUMERATE every bundled executable script under the plugin:
#        hooks/*.sh hooks/*.js, lib/*.js, scripts/*.mjs scripts/*.js,
#        any *.py / *.cjs, and skills/**/scripts/** (plus any other
#        executable-bit .sh under skills/). It deliberately EXCLUDES
#        tests/, node_modules/, .git/, and docs/ so the report reflects
#        only the code we actually ship to users.
#
#   2. ORPHAN / REFERENCE report: for each shipped script, assert that it
#        is referenced *somewhere* in the repo — by hooks.json, a command
#        or skill markdown file, package.json, another script, or the CI
#        workflow. A script with no reference anywhere is a supply-chain
#        smell (dead code that still ships an executable). Orphans are
#        reported as WARN — they do NOT hard-fail the gate on their own,
#        because the primary deliverable here is the ENUMERATION so a
#        human can audit the surface. Flip HARD_FAIL_ON_ORPHAN=1 to make
#        orphans fatal.
#
#   3. AGENTSHIELD gate: best-effort `npx --no-install ecc-agentshield
#        scan`. Gate semantics:
#          - agentshield absent  -> print "skipped", exit 0 (audit still
#            lists scripts + orphans).
#          - agentshield present, CRITICAL/HIGH findings -> exit non-zero
#            (release gate blocks).
#          - agentshield present, only low/no findings   -> exit 0 (WARN).
#
# POSIX bash, dependency-free (besides the optional agentshield), and
# cwd-independent: the repo root is resolved from this script's own path.
#
# Usage:
#   bash tests/bundled-exec-audit.sh
#
# Exit codes:
#   0  clean (or only orphan WARNs / only low agentshield findings)
#   1  agentshield reported CRITICAL/HIGH findings (release gate block)
#   1  orphan found AND HARD_FAIL_ON_ORPHAN=1

set -u

# Toggle: make orphaned executables a hard failure. Default off — orphans
# are advisory WARNs so the enumeration report is always produced.
HARD_FAIL_ON_ORPHAN="${HARD_FAIL_ON_ORPHAN:-0}"

# Resolve repo root as the parent of this script's directory so the run
# works regardless of the caller's cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}" || { echo "FAIL: cannot cd to repo root ${ROOT_DIR}" >&2; exit 2; }

echo "== soe bundled-executable audit =="
echo "repo root: ${ROOT_DIR}"
echo

# ---------------------------------------------------------------------------
# 1. Enumerate shipped executable scripts.
#    Extensions: .sh .js .mjs .cjs .py  — plus any executable-bit file that
#    lives under a skills/**/scripts/ directory (covers extensionless bash
#    launchers such as sdd-workspace, task-brief, review-package).
#    Pruned trees: tests/ node_modules/ .git/ docs/
# ---------------------------------------------------------------------------
scripts=()
while IFS= read -r -d '' f; do
  scripts+=("${f#./}")
done < <(
  find . \
    \( -path './node_modules' -o -path './.git' -o -path './tests' -o -path './docs' \) -prune \
    -o -type f \
       \( -name '*.sh' -o -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.py' \) \
       -print0 2>/dev/null
)

# Also catch executable-bit files under any skills/**/scripts/ dir that have
# no recognised extension (e.g. sdd-workspace, task-brief, review-package).
while IFS= read -r -d '' f; do
  rel="${f#./}"
  # skip if already captured by the extension pass
  already=0
  for s in "${scripts[@]:-}"; do
    [ "$s" = "$rel" ] && { already=1; break; }
  done
  [ "$already" -eq 0 ] && scripts+=("$rel")
done < <(
  find ./skills -type d -name scripts -prune -false \
    -o -path '*/scripts/*' -type f -perm -u+x -print0 2>/dev/null
)

# Sort + de-dupe for a stable, readable report.
IFS=$'\n' scripts=($(printf '%s\n' "${scripts[@]:-}" | sort -u))
unset IFS

script_count="${#scripts[@]}"
if [ "${script_count}" -eq 0 ]; then
  echo "WARN: no bundled executable scripts found — nothing to audit."
  echo
fi

# ---------------------------------------------------------------------------
# 2. Orphan / reference report.
#    A script is "referenced" if its basename appears anywhere in the repo
#    (excluding node_modules/.git and the script file itself). References may
#    come from hooks.json, command/skill markdown, package.json, another
#    script, docs, or the CI workflow — all count as legitimate anchors.
# ---------------------------------------------------------------------------
echo "-- enumeration + reference report (${script_count} scripts) --"

orphans=()
referenced_count=0

for rel in "${scripts[@]:-}"; do
  [ -n "$rel" ] || continue
  base="$(basename "$rel")"

  # Search the whole repo for the basename, excluding vcs/deps and the
  # script's own file (a file referencing itself is not a real reference).
  ref="$(grep -rIl --fixed-strings \
            --exclude-dir=node_modules --exclude-dir=.git \
            -- "$base" . 2>/dev/null \
          | grep -vE "(^|/)${base}\$" \
          | head -n1)"

  if [ -n "$ref" ]; then
    referenced_count=$((referenced_count + 1))
    printf '  [ref ] %-58s <- %s\n' "$rel" "${ref#./}"
  else
    orphans+=("$rel")
    printf '  [WARN] %-58s <- (no reference found)\n' "$rel"
  fi
done

echo
echo "  enumerated : ${script_count}"
echo "  referenced : ${referenced_count}"
echo "  orphans    : ${#orphans[@]}"

exit_code=0

if [ "${#orphans[@]}" -gt 0 ]; then
  echo
  echo "-- orphaned executables (no reference found anywhere) --"
  for o in "${orphans[@]}"; do
    echo "  WARN orphan: ${o}"
  done
  if [ "${HARD_FAIL_ON_ORPHAN}" = "1" ]; then
    echo "  HARD_FAIL_ON_ORPHAN=1 -> treating orphans as fatal."
    exit_code=1
  else
    echo "  (advisory — set HARD_FAIL_ON_ORPHAN=1 to fail the gate on orphans)"
  fi
fi

# ---------------------------------------------------------------------------
# 3. AgentShield scan (best-effort).
#    Gate: absent -> skip (exit 0); CRITICAL/HIGH -> non-zero; else 0.
# ---------------------------------------------------------------------------
echo
echo "-- agentshield scan --"

if ! command -v npx >/dev/null 2>&1; then
  echo "  npx not available — agentshield scan skipped."
else
  # --no-install: never fetch from the network; only run if already present.
  as_out="$(npx --no-install ecc-agentshield scan 2>&1)"
  as_rc="$?"

  if printf '%s' "$as_out" | grep -qiE 'not installed|could not determine|npm error|command not found|404 Not Found'; then
    echo "  agentshield not installed — skipped"
  else
    printf '%s\n' "$as_out" | sed 's/^/  | /'
    # Gate on severity: a non-zero exit from agentshield, or any CRITICAL/HIGH
    # token in its output, blocks the release. Low findings are advisory.
    if [ "$as_rc" -ne 0 ] || printf '%s' "$as_out" | grep -qiE '\b(CRITICAL|HIGH)\b'; then
      echo "  GATE: agentshield reported CRITICAL/HIGH (or non-zero exit) — blocking release."
      exit_code=1
    else
      echo "  GATE: no CRITICAL/HIGH findings — advisory only."
    fi
  fi
fi

echo
if [ "${exit_code}" -eq 0 ]; then
  echo "== audit PASS (exit 0) =="
else
  echo "== audit FAIL (exit ${exit_code}) — release gate blocked =="
fi

exit "${exit_code}"
