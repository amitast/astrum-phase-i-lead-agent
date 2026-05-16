#!/usr/bin/env bash
# Validates .claude/agents/*.md, .claude/hooks/*.sh, and .claude/settings.json.
# Exits 0 if all checks pass; exits 1 if any failures are found.
# Usage: bash .claude/validate-skills.sh

set -uo pipefail

CLAUDE_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$CLAUDE_DIR/.." && pwd)"

ERRORS=0
WARNINGS=0

VALID_MODELS=("haiku" "sonnet" "opus")
VALID_TOOLS=("Read" "Bash" "Edit" "Write" "WebFetch" "WebSearch" "Glob" "Grep" "Agent")

fail()  { echo "  ✗ FAIL: $1" >&2; ERRORS=$((ERRORS + 1)); }
warn()  { echo "  ⚠ WARN: $1"; WARNINGS=$((WARNINGS + 1)); }
pass()  { echo "  ✓ $1"; }

# ── 1. Agent files ────────────────────────────────────────────────────────────
echo ""
echo "── Agent files (.claude/agents/*.md) ──────────────────────────────────"

agent_count=0
for agent_file in "$CLAUDE_DIR/agents/"*.md; do
  [ -f "$agent_file" ] || continue
  agent_count=$((agent_count + 1))
  filename=$(basename "$agent_file" .md)
  echo ""
  echo "  [$filename]"

  # Extract YAML frontmatter (content between first two --- lines)
  frontmatter=$(awk 'BEGIN{c=0} /^---/{c++; if(c==2) exit; next} c==1{print}' "$agent_file")

  if [ -z "$frontmatter" ]; then
    fail "no YAML frontmatter found (must start with --- block)"
    continue
  fi

  # name: must match filename
  name_val=$(echo "$frontmatter" | grep '^name:' | sed 's/^name: *//' | tr -d "\"'")
  if [ -z "$name_val" ]; then
    fail "missing 'name' field"
  elif [ "$name_val" != "$filename" ]; then
    fail "name '$name_val' doesn't match filename '$filename.md'"
  else
    pass "name matches filename"
  fi

  # description: must be present and non-empty
  desc_val=$(echo "$frontmatter" | grep '^description:' | sed 's/^description: *//')
  if [ -z "$desc_val" ]; then
    fail "missing or empty 'description' — orchestrator won't delegate to this agent"
  else
    pass "description present"
  fi

  # model: if present, must be a valid Claude Code model
  model_val=$(echo "$frontmatter" | grep '^model:' | sed 's/^model: *//' | tr -d "\"'")
  if [ -n "$model_val" ]; then
    valid_model=false
    for m in "${VALID_MODELS[@]}"; do
      [ "$model_val" = "$m" ] && valid_model=true && break
    done
    if $valid_model; then
      pass "model: $model_val"
    else
      fail "model '$model_val' is invalid — must be one of: ${VALID_MODELS[*]}"
    fi
  else
    pass "model: (inherits from parent)"
  fi

  # tools: each entry must be a known Claude Code tool
  in_tools=false
  while IFS= read -r line; do
    if echo "$line" | grep -q '^tools:'; then
      in_tools=true; continue
    fi
    if $in_tools; then
      # Stop when we hit the next top-level YAML key
      if echo "$line" | grep -qE '^[a-zA-Z]'; then
        break
      fi
      tool=$(echo "$line" | sed 's/^ *- *//' | tr -d "\"'")
      [ -z "$tool" ] && continue
      valid_tool=false
      for t in "${VALID_TOOLS[@]}"; do
        [ "$tool" = "$t" ] && valid_tool=true && break
      done
      if $valid_tool; then
        pass "tool: $tool"
      else
        fail "tool '$tool' is not a recognised Claude Code tool name (valid: ${VALID_TOOLS[*]})"
      fi
    fi
  done <<< "$frontmatter"
done

if [ $agent_count -eq 0 ]; then
  warn "no agent files found in .claude/agents/"
fi

# ── 2. Hook scripts ───────────────────────────────────────────────────────────
echo ""
echo "── Hook scripts (.claude/hooks/*.sh) ──────────────────────────────────"

hook_count=0
for hook_file in "$CLAUDE_DIR/hooks/"*.sh; do
  [ -f "$hook_file" ] || continue
  hook_count=$((hook_count + 1))
  hookname=$(basename "$hook_file")
  echo ""
  echo "  [$hookname]"

  # Executable bit
  if [ -x "$hook_file" ]; then
    pass "executable"
  else
    fail "not executable — run: chmod +x $hook_file"
  fi

  # Bash syntax check (no execution)
  if bash -n "$hook_file" 2>/dev/null; then
    pass "bash syntax valid"
  else
    fail "bash syntax error:"
    bash -n "$hook_file" 2>&1 | sed 's/^/      /' >&2
  fi

  # Warn on hardcoded absolute paths (portability issue)
  if grep -qE '(/home/|/Users/|/root/)' "$hook_file" 2>/dev/null; then
    warn "contains hardcoded absolute path — use \$CLAUDE_PROJECT_DIR for portability"
  fi
done

if [ $hook_count -eq 0 ]; then
  warn "no hook scripts found in .claude/hooks/"
fi

# ── 3. settings.json ──────────────────────────────────────────────────────────
echo ""
echo "── Settings (.claude/settings.json) ────────────────────────────────────"
echo ""

settings_file="$CLAUDE_DIR/settings.json"
if [ ! -f "$settings_file" ]; then
  fail "settings.json not found"
else
  # Valid JSON
  if python3 -m json.tool "$settings_file" > /dev/null 2>&1; then
    pass "valid JSON"
  else
    fail "invalid JSON:"
    python3 -m json.tool "$settings_file" 2>&1 | sed 's/^/    /' >&2
  fi

  # Check hook command paths resolve to existing executable files
  python3 - <<PYEOF
import json, os, sys, re

repo_root = "$REPO_ROOT"
claude_dir = "$CLAUDE_DIR"
settings_path = "$settings_file"

with open(settings_path) as f:
    data = json.load(f)

errors = 0
warnings = 0

for event, event_hooks in data.get("hooks", {}).items():
    for group in event_hooks:
        for hook in group.get("hooks", []):
            cmd = hook.get("command", "")
            expanded = cmd.replace("\$CLAUDE_PROJECT_DIR", repo_root)
            # Warn if hardcoded absolute path (not using env var)
            if re.search(r'(/home/|/Users/|/root/)', cmd):
                print(f"  ⚠ WARN: hook '{event}' uses hardcoded path — use \$CLAUDE_PROJECT_DIR instead")
                warnings += 1
            # Find the script file in the command
            script_path = None
            for part in expanded.split():
                if part.endswith(".sh") or (part.startswith("/") and os.path.sep in part):
                    script_path = part
                    break
            if script_path:
                if not os.path.isfile(script_path):
                    print(f"  ✗ FAIL: hook '{event}' references missing file: {script_path}", file=sys.stderr)
                    errors += 1
                elif not os.access(script_path, os.X_OK):
                    print(f"  ✗ FAIL: hook '{event}' script is not executable: {script_path}", file=sys.stderr)
                    errors += 1
                else:
                    print(f"  ✓ hook '{event}' script exists and is executable")

sys.exit(errors)
PYEOF
  settings_exit=$?
  [ $settings_exit -ne 0 ] && ERRORS=$((ERRORS + settings_exit))
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────────────────────────"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo "✓ All skills validation checks passed ($agent_count agents, $hook_count hooks, settings.json)."
  exit 0
elif [ $ERRORS -eq 0 ]; then
  echo "✓ Passed with $WARNINGS warning(s) — review above."
  exit 0
else
  echo "✗ $ERRORS error(s) found ($WARNINGS warning(s)). Fix the issues above before proceeding." >&2
  exit 1
fi
