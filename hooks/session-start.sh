#!/usr/bin/env bash
# SessionStart hook for soe plugin

set -euo pipefail

# Determine plugin root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Harness-awareness (Layer-1, design §8).
# This hook emits Claude Code SessionStart JSON — the SessionStart hook contract
# is Claude-Code-specific. Codex and OpenCode do not consume this payload; they
# bootstrap the same `using-soe` skill through their own Layer-1 packaging
# (.codex/AGENTS.md persistent_instructions, .opencode/opencode.json
# instructions). So for any non-Claude harness we skip JSON emission and print a
# short human note instead, leaving the Claude Code path (the default) untouched.
#
# SOE_HARNESS may be set by the invoking harness; default is claude-code so the
# existing Claude Code behaviour and its test are preserved.
SOE_HARNESS="${SOE_HARNESS:-${CLAUDE_HARNESS:-claude-code}}"

case "$SOE_HARNESS" in
  codex|opencode)
    printf '%s\n' "[soe] Layer-1 active for harness '${SOE_HARNESS}'. This SessionStart JSON hook is Claude-Code-only; load the 'using-soe' skill and read .${SOE_HARNESS}/ for the Layer-1 index. Shared state: .soe/ and docs/plans/. Layer-2 engine is Claude-Code-only in v1." >&2
    exit 0
    ;;
esac

# Read using-soe content
soe_content=$(cat "${PLUGIN_ROOT}/skills/using-soe/SKILL.md" 2>&1 || echo "Error reading using-soe skill")

# Escape string for JSON embedding using bash parameter substitution.
# Each ${s//old/new} is a single C-level pass - orders of magnitude
# faster than the character-by-character loop this replaces.
escape_for_json() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\r'/\\r}"
    s="${s//$'\t'/\\t}"
    printf '%s' "$s"
}

soe_escaped=$(escape_for_json "$soe_content")

# Output context injection as JSON
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<EXTREMELY_IMPORTANT>\nYou have soe skills.\n\n**Below is the full content of your 'soe:using-soe' skill - your introduction to using skills. For all other skills, use the 'Skill' tool:**\n\n${soe_escaped}\n</EXTREMELY_IMPORTANT>"
  }
}
EOF

exit 0
