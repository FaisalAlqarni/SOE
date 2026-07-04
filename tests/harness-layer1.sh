#!/usr/bin/env bash
#
# harness-layer1.sh — multi-harness Layer-1 consumability check (design §8, F15).
#
# Layer-1 = discipline skills + rules + adversarial-review guidance + shared
# committed state (.soe/, docs/plans/), exposed for the Codex and OpenCode
# harnesses in addition to Claude Code.
#
# This test asserts, WITHOUT duplicating skill/rule content into the harness
# dirs, that each harness dir:
#   1. exists and carries a manifest + an index,
#   2. references the shared skills/ tree (not a private copy),
#   3. references the shared rules/ tree,
#   4. references the adversarial-review discipline guidance,
#   5. references the shared-state paths (.soe/ and docs/plans/) IDENTICALLY
#      across harnesses (a consumability check), and
#   6. documents that the Layer-2 engine is Claude-Code-only / deferred.
#
# It also guards against content duplication: the harness dirs must NOT contain
# their own SKILL.md files.
#
# POSIX bash. Prints PASS/FAIL lines; exits non-zero on any failure.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

FAILURES=0

pass() { printf 'PASS %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; FAILURES=$((FAILURES + 1)); }

# check_contains <file> <needle> <label>
check_contains() {
  file="$1"; needle="$2"; label="$3"
  if [ ! -f "$file" ]; then
    fail "$label — missing file: $file"
    return
  fi
  if grep -qF -- "$needle" "$file"; then
    pass "$label"
  else
    fail "$label — '$needle' not found in $file"
  fi
}

# The shared source-of-truth trees must exist.
[ -d "${ROOT_DIR}/skills" ] || fail "shared skills/ tree missing"
[ -d "${ROOT_DIR}/rules" ]  || fail "shared rules/ tree missing"
[ -d "${ROOT_DIR}/skills/adversarial-review" ] || fail "adversarial-review discipline skill missing from shared skills/"

# Per-harness manifest + index files.
CODEX_MANIFEST="${ROOT_DIR}/.codex/config.toml"
CODEX_INDEX="${ROOT_DIR}/.codex/AGENTS.md"
OPENCODE_MANIFEST="${ROOT_DIR}/.opencode/opencode.json"
OPENCODE_INDEX="${ROOT_DIR}/.opencode/README.md"

# --- Codex ---------------------------------------------------------------
[ -d "${ROOT_DIR}/.codex" ] || fail ".codex harness dir missing"
[ -f "$CODEX_MANIFEST" ] && pass "codex: manifest (config.toml) present" || fail "codex: manifest (config.toml) missing"
[ -f "$CODEX_INDEX" ]    && pass "codex: index (AGENTS.md) present"       || fail "codex: index (AGENTS.md) missing"
check_contains "$CODEX_INDEX" "../skills/"          "codex: references shared skills/ tree"
check_contains "$CODEX_INDEX" "../rules/common/"    "codex: references shared rules/ tree"
check_contains "$CODEX_INDEX" "adversarial-review"  "codex: references adversarial-review guidance"
check_contains "$CODEX_INDEX" ".soe/"               "codex: references shared-state .soe/"
check_contains "$CODEX_INDEX" "docs/plans/"         "codex: references shared-state docs/plans/"
check_contains "$CODEX_INDEX" "Claude-Code-only"    "codex: documents Layer-2 engine as Claude-Code-only"
check_contains "$CODEX_INDEX" "deferred"            "codex: documents engine adapters as deferred"

# --- OpenCode ------------------------------------------------------------
[ -d "${ROOT_DIR}/.opencode" ] || fail ".opencode harness dir missing"
[ -f "$OPENCODE_MANIFEST" ] && pass "opencode: manifest (opencode.json) present" || fail "opencode: manifest (opencode.json) missing"
[ -f "$OPENCODE_INDEX" ]    && pass "opencode: index (README.md) present"        || fail "opencode: index (README.md) missing"
# The manifest must register the shared skills path (skills.paths -> ../skills).
check_contains "$OPENCODE_MANIFEST" "../skills"     "opencode: manifest registers shared ../skills path"
check_contains "$OPENCODE_INDEX" "../skills/"       "opencode: references shared skills/ tree"
check_contains "$OPENCODE_INDEX" "../rules/common/" "opencode: references shared rules/ tree"
check_contains "$OPENCODE_INDEX" "adversarial-review" "opencode: references adversarial-review guidance"
check_contains "$OPENCODE_INDEX" ".soe/"            "opencode: references shared-state .soe/"
check_contains "$OPENCODE_INDEX" "docs/plans/"      "opencode: references shared-state docs/plans/"
check_contains "$OPENCODE_INDEX" "Claude-Code-only" "opencode: documents Layer-2 engine as Claude-Code-only"
check_contains "$OPENCODE_INDEX" "deferred"         "opencode: documents engine adapters as deferred"

# --- No content duplication ---------------------------------------------
# Harness dirs must reference, not copy, the shared skills. Assert neither
# harness dir contains its own SKILL.md files.
dup_codex="$(find "${ROOT_DIR}/.codex" -name 'SKILL.md' 2>/dev/null | wc -l | tr -d ' ')"
dup_opencode="$(find "${ROOT_DIR}/.opencode" -name 'SKILL.md' 2>/dev/null | wc -l | tr -d ' ')"
[ "$dup_codex" = "0" ]    && pass "codex: no duplicated SKILL.md content"    || fail "codex: found $dup_codex duplicated SKILL.md file(s)"
[ "$dup_opencode" = "0" ] && pass "opencode: no duplicated SKILL.md content" || fail "opencode: found $dup_opencode duplicated SKILL.md file(s)"

# --- Shared-state referenced IDENTICALLY across harnesses ----------------
# Consumability: both harnesses must name the SAME shared-state paths, so a
# handoff from one harness to another reads/writes the same locations.
for token in ".soe/" "docs/plans/"; do
  if grep -qF -- "$token" "$CODEX_INDEX" && grep -qF -- "$token" "$OPENCODE_INDEX"; then
    pass "shared-state '$token' referenced identically across codex + opencode"
  else
    fail "shared-state '$token' NOT referenced identically across harnesses"
  fi
done

# --- Summary -------------------------------------------------------------
if [ "$FAILURES" -eq 0 ]; then
  printf '\nharness-layer1: all checks passed\n'
  exit 0
fi
printf '\nharness-layer1: %d check(s) failed\n' "$FAILURES"
exit 1
