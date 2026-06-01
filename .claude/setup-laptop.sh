#!/usr/bin/env bash
# One-shot setup script — run this once on a new machine after checking out the branch.
# Usage: bash .claude/setup-laptop.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Astrum Lead Agent — laptop setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Worker dependencies
echo "[1/4] Installing worker dependencies..."
cd "$REPO_ROOT/worker"
npm install
cd "$REPO_ROOT"
echo "      Done."
echo ""

# 2. Skills validator
echo "[2/4] Validating Claude skills configuration..."
bash "$REPO_ROOT/.claude/validate-skills.sh"
echo ""

# 3. .mcp.json
echo "[3/4] Checking .mcp.json..."
if [ -f "$REPO_ROOT/.mcp.json" ]; then
  echo "      .mcp.json already exists — skipping."
else
  cp "$REPO_ROOT/.mcp.json.example" "$REPO_ROOT/.mcp.json"
  echo "      Created .mcp.json from example."
  echo "      ⚠  Open .mcp.json and add your Salesforce credentials before starting Claude Code."
fi
echo ""

# 4. Hook permissions
echo "[4/4] Ensuring hook scripts are executable..."
chmod +x "$REPO_ROOT/.claude/hooks/"*.sh
chmod +x "$REPO_ROOT/.claude/validate-skills.sh"
echo "      Done."
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Setup complete. Next steps:"
echo "  1. If .mcp.json was just created, fill in your"
echo "     Salesforce credentials."
echo "  2. Restart Claude Code to load the updated"
echo "     settings, hooks, and agents."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
