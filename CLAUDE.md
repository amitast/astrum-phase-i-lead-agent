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
- Worker language: TypeScript / Node (decision pending — confirm with Amit)
- Folder layout: see repo root; do not create top-level folders without approval.
- Commit messages: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`).

## Tooling — Salesforce MCP
This project uses the official `@salesforce/mcp` server (configured in `.mcp.json`).
- Use MCP tools (`mcp__salesforce__*`) for all Salesforce interactions in preference to shelling out to `sf`.
- **READ-ONLY toolsets are enabled in Phase 0–1**: orgs, metadata-read, query, agentforce-read, data-cloud-read.
- Metadata deploy, DML, and Apex execute are **denied by default** — request explicit permission per command if/when required.
- Always confirm the target org alias is `par-sandbox` before any MCP tool call. Never target production.

## Phase gating
- **Phase 0** (current): docs, blueprint, environment setup only. No Salesforce metadata yet.
- **Phase 1**: Salesforce data model in PAR sandbox.
- **Phase 2**: Source ingestion PoC.
- **Phase 3**: Enrichment + scoring.
- **Phase 4**: Salesforce UI + BD workflow.
- **Phase 5**: Pilot validation.

Do not jump phases without Amit's explicit instruction.

## When in doubt
Stop and ask. This project values audit trail and source integrity over speed.

---

# Astrum CRO – Orbit Project Guidelines

## Core Governance & Behavior
* **Environment Restriction:** All generated metadata must target Developer Sandboxes or Scratch Orgs (current named target: `par-sandbox`) and must be manually tested by a human before any promotion. Never make changes directly to Production.
* **Challenge the Requirement:** Before generating any new Flow or Apex Trigger, challenge the requirement. Always check if the goal can be achieved with a simpler solution first — default field values, a formula, or a validation rule.

## Grounding & SFDX Integration
* **Verify Local Metadata:** Before referencing specific fields or picklist values in generated code, verify that they already exist within the local SFDX project.
* **Dependency Management:** When instructed to deploy changes to Salesforce, ensure all required dependencies (e.g., permission sets, new fields) are deployed first, and verify that each deployment was successful before proceeding.
* **Metadata Seeding:** When a user requests to "seed my local project with metadata from Salesforce," automatically determine the correct org alias, generate an up-to-date manifest (`sf project generate manifest --output-dir ./manifest --from-org <orgname/alias>`), and retrieve the metadata (`sf project retrieve start --manifest`).

## Coding Standards & Naming Conventions
* **Flow Naming Conventions:** Always append the specific flow type to the end of both the Label and the API Name. Examples: "Update Orbit Account: After Save", "Send Reminder: Scheduled".
* **Flow Descriptions:** Include a detailed description wherever supported, including Get Records elements, Assignments, and Variables. Exception: the Start element does not support descriptions.
* **Bypass Logic:** Every record-triggered Flow must include bypass logic so it can be temporarily disabled for data loads or exceptions. Control this bypass through a Custom Permission (e.g., "Bypass Flow").

## Reference Material
* **Use Existing Examples:** When tasked with building a Flow, reference the concrete examples in the `Example/Flows` directory. Use these as templates to produce valid XML that deploys successfully to the Orbit org.
