#!/usr/bin/env bash
# Fires when Claude finishes its turn. Reminds to update the project memory file.

cat <<'EOF'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Session end reminder
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Did you update LLM-TXTS/Astrum_Phase_I_Lead_Agent_Project_Memory.md?

 Check for:
   [ ] Phase status changes
   [ ] Data state changes (account/signal counts, scoring bands)
   [ ] New hard-won learnings / technical constraints
   [ ] Open questions resolved or newly opened
   [ ] Railway worker env vars or cron changes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF

exit 0
