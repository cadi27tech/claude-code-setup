#!/usr/bin/env bash
# PreToolUse hook for Write/Edit: block writes containing em-dash or en-dash.
# Reads JSON tool input on stdin, checks new_string / content for banned
# characters. Exits 2 (block) with a message if found.

set -e
. "$(dirname "$0")/_hookjson.sh"
INPUT=$(cat)

if [ "$HOOKJSON_OK" != "1" ]; then
  echo "BLOCKED: the em-dash guard cannot read its input - no python interpreter on PATH. Fix the hook rather than writing unchecked." >&2
  exit 2
fi

NEW=$(echo "$INPUT" | hookjson new_string content)

EM=$(printf '\342\200\224'); EN=$(printf '\342\200\223')  # UTF-8 bytes, so this file holds no dash characters
if printf '%s' "$NEW" | grep -q -F -e "$EM" -e "$EN"; then
  echo "BLOCKED: em-dash or en-dash detected in the write. House rule: only the plain hyphen '-' is allowed. Replace the character before re-running." >&2
  exit 2
fi

exit 0
