#!/bin/bash
set -euo pipefail

# Only run in Claude Code remote sessions
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

echo "[session-start] Installing worker dependencies..."
cd "$REPO_ROOT/worker"
npm install

echo "[session-start] Running typecheck..."
npm run typecheck

echo "[session-start] Validating Claude skills configuration..."
bash "$REPO_ROOT/.claude/validate-skills.sh"

echo "[session-start] Done."
