#!/usr/bin/env bash
# Enforces CLAUDE.md hard rules on Bash tool calls.
# Receives tool input JSON via stdin; exits 1 to block, 0 to allow.

INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('command',''))" 2>/dev/null)

# Hard rule 1: no sf deploy without explicit approval
if echo "$CMD" | grep -qE '^\s*sf (project deploy start|deploy)\b'; then
  echo "BLOCKED: 'sf deploy' requires explicit per-command approval from Amit. Ask before running." >&2
  exit 1
fi

# Hard rule 2: no git commit or push without explicit approval
if echo "$CMD" | grep -qE '^\s*git (commit|push)\b'; then
  echo "BLOCKED: 'git commit' / 'git push' require explicit per-command approval from Amit. Ask before running." >&2
  exit 1
fi

# Hard rule 3: production org guard — block any sf/sfdx call targeting production
if echo "$CMD" | grep -qiE '(astrum\.my\.salesforce\.com)' && ! echo "$CMD" | grep -qi 'astrumpar\.sandbox'; then
  echo "BLOCKED: Command targets production Salesforce org. Only par-sandbox (astrumpar.sandbox) is permitted." >&2
  exit 1
fi

exit 0
