# Project: Astrum Phase I Lead Identification Agent

## Mandatory context
ALWAYS read `LLM-TXTS/Astrum_Phase_I_Lead_Agent_Project_Memory.md` at the start of every session before doing any work.
ALWAYS consult `PRDS/Astrum_Phase_I_Lead_Identification_Agent_PRD.md` and `architecture/solution_architecture.md` before generating Salesforce metadata or worker code.

## Hard rules (non-negotiable)
1. **No `sf project deploy start` / `sf deploy` without explicit user approval per command.**
2. **No `git commit` / `git push` without explicit user approval per command.**
3. **No production Salesforce org.** Target is **PAR sandbox** only.
4. **No external API calls** (ClinicalTrials.gov, SEC EDGAR, etc.) until Phase 2 explicitly begins.
5. **No paid enrichment APIs. No LinkedIn scraping.** Ever in MVP.
6. **No invented Salesforce metadata.** If unsure of an API name, ask — don't guess.
7. **Source-grounding:** any AI-generated content claim must cite a Source record Id or be marked "not stated."
8. **Mark all assumptions explicitly** in any artefact.
9. **Sandbox-first.** Validate metadata in PAR before any production conversation.
10. **Low token usage.** Prefer reading stored fields over re-prompting the LLM.

## Project conventions
- Salesforce org alias: `par-sandbox`
- Worker language: TypeScript / Node
- Folder layout: see repo root; do not create top-level folders without approval.
- Commit messages: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`).

## Commands — Worker (`worker/`)
```bash
npm run build       # tsc --skipLibCheck
npm run dev         # ts-node src/index.ts (runs full pipeline locally)
npm run typecheck   # tsc --noEmit (type-check without emitting)
npm run start       # node dist/index.js (run compiled output)

# Deploy to Railway
railway up --detach --service insightful-empathy

# View deployment logs
railway logs --deployment <id>
```

## Commands — Salesforce metadata (`sfdx-project/`)
```bash
# Retrieve latest metadata from PAR sandbox
sf project generate manifest --output-dir manifest --from-org par-sandbox
sf project retrieve start --manifest manifest/package.xml -o par-sandbox
```

## Key file paths
| Purpose | Path |
|---|---|
| Worker entry point | `worker/src/index.ts` |
| Scoring formula | `worker/src/scoring/deterministic.ts` |
| Score writer (Salesforce PATCH) | `worker/src/scoring/scoreWriter.ts` |
| Region / US filter | `worker/src/utils/usFilter.ts` |
| ClinicalTrials.gov source | `worker/src/sources/clinicaltrials.ts` |
| EDGAR enrichment | `worker/src/sources/edgar.ts` |
| Salesforce metadata | `sfdx-project/` |
| Project memory | `LLM-TXTS/Astrum_Phase_I_Lead_Agent_Project_Memory.md` |
| PRD | `PRDS/Astrum_Phase_I_Lead_Identification_Agent_PRD.md` |

## Tooling — Salesforce MCP
This project uses the official `@salesforce/mcp` server (configured in `.mcp.json`).
- Use MCP tools (`mcp__salesforce__*`) for all Salesforce interactions in preference to shelling out to `sf`.
- **READ-ONLY toolsets are enabled in Phase 0–1**: orgs, metadata-read, query, agentforce-read, data-cloud-read.
- Metadata deploy, DML, and Apex execute are **denied by default** — request explicit permission per command if/when required.
- Always confirm the target org alias is `par-sandbox` before any MCP tool call. Never target production.

## Phase gating
- **Phase 0** ✅: docs, blueprint, environment setup.
- **Phase 1** ✅: Salesforce data model in PAR sandbox.
- **Phase 2** ✅: Source ingestion worker on Railway (ClinicalTrials.gov, EDGAR, GlobeNewswire).
- **Phase 3** ✅: Deterministic scoring live (13 Hot, 31 Warm, 3 Watch).
- **Phase 4** ✅: Lightning app, Signals Inbox, list views, BD tabs.
- **Phase 5** **(current)**: Pilot validation — Catherine's weekly review in progress.

Do not jump phases without Amit's explicit instruction.

## When in doubt
Stop and ask. This project values audit trail and source integrity over speed.

---

## Salesforce coding standards
- Verify all field and object API names exist in `sfdx-project/` before generating metadata. Never invent API names.
- Deploy dependencies (permission sets, fields) before dependent objects. Confirm each deploy succeeded before proceeding.
- Before generating a new Flow or Apex Trigger, check whether a formula field or validation rule suffices.
- Every record-triggered Flow must include bypass logic (Custom Permission: `Bypass_Flow`) to allow safe data loads.
- Flow Label and API Name must both end with the flow type: e.g. "Update Signal Status: After Save".
