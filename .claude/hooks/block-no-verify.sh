#!/usr/bin/env bash
# PreToolUse hook: blocks commands that use --no-verify.
# Receives tool input JSON on stdin. Exits 2 to block, 0 to allow.

set -euo pipefail

command=$(jq -r '.tool_input.command // empty' 2>/dev/null)
[[ -z "$command" ]] && exit 0

if echo "$command" | grep -q -- '--no-verify'; then
  echo "Blocked: --no-verify is not allowed" >&2
  exit 2
fi

exit 0
