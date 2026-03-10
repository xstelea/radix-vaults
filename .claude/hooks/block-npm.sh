#!/usr/bin/env bash
# PreToolUse hook: blocks `npm` commands, allowing `pnpm` and `npx`.
# Receives tool input JSON on stdin. Exits 2 to block, 0 to allow.

set -euo pipefail

command=$(jq -r '.tool_input.command // empty' 2>/dev/null)
[[ -z "$command" ]] && exit 0

# Match "npm" as a whole word. grep -w uses word boundaries (\b),
# so "pnpm" won't match (p before npm prevents boundary), nor will "npx".
if echo "$command" | grep -qw 'npm'; then
  echo "Blocked: use pnpm, not npm (see CLAUDE.md)" >&2
  exit 2
fi

exit 0
