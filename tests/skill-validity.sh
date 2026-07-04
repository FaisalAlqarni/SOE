#!/usr/bin/env bash
#
# skill-validity.sh — assert every skill/agent markdown file has YAML
# frontmatter (delimited by `---` lines) containing a non-empty `name:`
# field AND a non-empty `description:` field.
#
# Usage:
#   bash tests/skill-validity.sh [DIR]
#
# With no argument, scans the real skills/*/SKILL.md and agents/*.md.
# With a DIR argument, scans DIR recursively for SKILL.md and agents/*.md
# so it can be pointed at tests/fixtures for self-testing.
#
# For each file prints `OK <path>` or `FAIL <path>: missing <field>`.
# Exits non-zero if any file fails (or, with no arg, exits 0 when there
# are simply no skills/agents present yet).

set -u

# Resolve repo root as the parent of this script's directory so the
# default (no-arg) scan works regardless of the caller's cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Extract a frontmatter field's value from a file.
# Reads only the block between the FIRST two `---` marker lines.
# Prints the trimmed value (empty string if the field is absent or empty).
frontmatter_field() {
  file="$1"
  field="$2"
  awk -v field="$field" '
    NR == 1 {
      if ($0 == "---") { in_fm = 1; next }
      else { exit }          # no frontmatter at all
    }
    in_fm && $0 == "---" { exit }   # end of frontmatter block
    in_fm {
      # Match "field:" at the start of the line, capture the rest.
      if (index($0, field ":") == 1) {
        val = substr($0, length(field) + 2)
        # trim leading/trailing whitespace
        gsub(/^[ \t]+/, "", val)
        gsub(/[ \t]+$/, "", val)
        print val
        exit
      }
    }
  ' "$file"
}

check_file() {
  file="$1"
  failed=0

  name="$(frontmatter_field "$file" name)"
  desc="$(frontmatter_field "$file" description)"

  if [ -z "$name" ]; then
    echo "FAIL ${file}: missing name"
    failed=1
  fi
  if [ -z "$desc" ]; then
    echo "FAIL ${file}: missing description"
    failed=1
  fi

  if [ "$failed" -eq 0 ]; then
    echo "OK ${file}"
  fi

  return "$failed"
}

# Determine scan roots.
#   - With a DIR argument: scan that directory (recursively) — used to
#     point the checker at tests/fixtures for self-testing.
#   - With no argument: scan ONLY the real skills/ and agents/ trees, so
#     that test fixtures (which deliberately include an invalid skill) are
#     never picked up by the default run.
scan_roots=()
if [ "$#" -ge 1 ]; then
  if [ ! -d "$1" ]; then
    echo "FAIL: directory not found: ${1}" >&2
    exit 2
  fi
  scan_roots+=("$1")
  scan_label="$1"
else
  [ -d "${ROOT_DIR}/skills" ] && scan_roots+=("${ROOT_DIR}/skills")
  [ -d "${ROOT_DIR}/agents" ] && scan_roots+=("${ROOT_DIR}/agents")
  scan_label="skills/ and agents/"
fi

# Collect files: any SKILL.md, plus any agents/*.md, found under the roots.
# -print0 / read -d '' keeps paths with spaces safe.
files=()
if [ "${#scan_roots[@]}" -gt 0 ]; then
  while IFS= read -r -d '' f; do
    files+=("$f")
  done < <(find "${scan_roots[@]}" -type f \( -name 'SKILL.md' -o -path '*/agents/*.md' \) -print0 2>/dev/null | sort -z)
fi

if [ "${#files[@]}" -eq 0 ]; then
  echo "No skill/agent files found under ${scan_label} (nothing to validate)."
  exit 0
fi

exit_code=0
for f in "${files[@]}"; do
  if ! check_file "$f"; then
    exit_code=1
  fi
done

exit "$exit_code"
