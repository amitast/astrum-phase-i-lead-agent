# Astrum Phase I Lead Agent — Project Memory

> Long-lived context for Claude Code sessions. Load this file at the start of every working session.
> Last updated: 2026-05-15

---

## Project Goal
Build a Salesforce/Orbit-native agentic Lead Generation system that formalises and scales Zak's current manual/Claude-assisted signal-scouting work. Pilot focus: **US biotech/pharma companies signalling a move into Phase I clinical development.**

## Stakeholders
- **Catherine** — Business sponsor. Defines BD priorities, modality/TA fit, and pilot success criteria. Final approver of production rollout.
- **Zak** — Operator of the current prototype (GitHub/Railway/Postgres "Signal Detection Engine"). Source of domain knowledge and current signal heuristics.
- **Amit** — Delivery lead. Owns architecture, Salesforce design, Claude Code prompting.

## Confirmed from transcript & screenshots
- Current prototype is a standalone vibe-coded app on GitHub/Railway/Postgres. **Not connected to Salesforce/Orbit.**
- UI has Companies, Signals, Events, Dashboard, Prospecting Map pages.
- Existing signal types in UI: funding round, investor event, key hire, partnership, planned trial, positive results, regulatory filing.
- Signal statuses: New, Processed, Archived.
- Sources used today: ClinicalTrials.gov, Google News, Labiotech.eu, FierceBiotech, BioSpace, GlobeNewswire, EMA, LinkedIn.
- Transcript: **Signals page is the most important future feature** (freshest outreach hooks).
- Transcript: source links matter — users verify evidence directly.
- Transcript: blind AI enrichment has been difficult/costly.
- Transcript: LinkedIn and hard-to-access sources are unreliable/expensive — **not assumed for MVP.**
- Transcript: pilot focus is **US**.

## Recommended design (NOT yet confirmed by org inspection)
- 6 custom Salesforce objects: `Target_Company__c`, `Signal__c`, `Source__c`, `Score_Snapshot__c`, `BD_Action__c`, `Agent_Audit__c`.
- External ingestion worker (Node or Python) for scraping/normalising; pushes to Salesforce via Bulk API.
- Agentforce limited to 3 narrow topics: Signal Classifier, BD Briefer, Scoring Explainer.
- Deterministic scoring (no ML in MVP).
- Sandbox-first. No production deploys without explicit Amit + Catherine approval.

## Hard rules for every Claude Code session on this project
1. **No hallucinated company data.** Every Signal must trace to a Source URL.
2. **No unsupported AI claims.** Agent outputs cite Source `Id`; missing facts = "not stated in source."
3. **No autonomous CRM writes from the agent.** Human review on every Agent-created Signal.
4. **No LinkedIn scraping. No paid enrichment APIs.** MVP uses free sources only.
5. **No production deployment without explicit human approval.**
6. **No `git push` / `git commit` without explicit approval from Amit.**
7. **Sandbox-first.** Never target a production Salesforce org.
8. **Assume nothing about the Astrum org.** Confirm object/field API names before generating metadata.
9. **Low token usage.** Prefer structured field reads over re-prompting LLM. No retrieval-augmented generation in MVP.
10. **Mark all assumptions explicitly** in any artefact produced.

## US market filter (canonical)
A company is "US" if ANY of:
- SEC EDGAR filing exists for the entity.
- ClinicalTrials.gov sponsor address country = United States.
- Press release lead paragraph mentions a US city/state AND no non-US HQ signal exists.
Edge case → `Country__c = Unknown`, route for human triage. Never silently drop.

## Source confidence tiers
| Tier | Examples | Default Confidence |
|---|---|---|
| 1 Regulatory | ClinicalTrials.gov, SEC EDGAR, FDA, EMA | High |
| 2 Trade Press | FierceBiotech, BioSpace, Endpoints, Labiotech | Medium-High |
| 3 Aggregator | GlobeNewswire, BusinessWire, company PR | Medium |
| 4 Social | LinkedIn, X, blogs | Low (excluded MVP) |

## Confirmed business inputs (2026-05-15, from Catherine)

### Modality priorities
1. Small molecule
2. ADC (antibody-drug conjugate)
3. Peptide
4. Oligonucleotide
5. Biosimilar

### Therapeutic area priorities
1. Oncology & Hematology
2. CNS
3. Immunology
4. Cardiometabolic

### Company stage sweet spot
Series A to Series C (inclusive).

---

## Open questions — resolved (Phase 1 clear to start)

All items below are closed. Confirmed answers are marked ✅; remaining questions are resolved by best practice recommendation (marked BP) and require no further stakeholder input before Phase 1 build.

| Question | Resolution | Source |
|---|---|---|
| Modality priorities | Small molecule, ADC, Peptide, Oligonucleotide, Biosimilar | ✅ Catherine 2026-05-15 |
| Therapeutic area priorities | Oncology & Hematology, CNS, Immunology, Cardiometabolic | ✅ Catherine 2026-05-15 |
| Company stage sweet spot | Series A to Series C | ✅ Catherine 2026-05-15 |
| Salesforce sandbox + Org ID | `par-sandbox` / `00DUD000007zF692AE` | ✅ Confirmed 2026-05-13 |
| Agentforce licence in sandbox | Licensed (confirmed by Amit) | ✅ Confirmed 2026-05-13 |
| "Orbit" = separate system? | No — internal brand name for the Salesforce org. No separate integration needed. | BP: architecture already reflects this |
| BD team size (pilot) | Assume 3 active BD reps | BP: typical boutique CRO |
| Hot-band capacity per week | ≤15 companies per week | BP: quality over volume for pilot |
| Long-term worker hosting | Railway (MVP) → AWS Lambda (post-pilot). Defer decision until pilot completes. | BP: minimise new infrastructure for MVP |
| Source__c → Account link in MVP | Standalone in MVP. Add optional Account lookup field BD can populate manually. Evaluate tighter link in Phase 4. | BP: avoids coupling complexity |
| Signal type priority order (Zak) | IND/IMPD filing > ClinicalTrials.gov registration > Funding round (A–C) > Key hire (CMO/VP Clinical) > Positive preclinical results > Partnership/licensing | BP: Phase I readiness heuristics |
| Worker self-service pause | No self-service in MVP (Amit contact). Add Custom Setting bypass toggle in Phase 4. | BP: avoid over-engineering MVP |

## Salesforce environment (confirmed 2026-05-13)
- **Alias:** `par-sandbox`
- **Org Id (PAR sandbox):** `00DUD000007zF692AE`
- **Org Name:** ASTRUM CRO, SL
- **Username:** `amit.kumar@astrumcro.com.astrumpar`
- **Instance URL:** `https://astrum--astrumpar.sandbox.my.salesforce.com`
- **Instance:** SWE92S
- **Sandbox name:** `astrumpar`
- **Type:** Sandbox (`IsSandbox = true` verified via SOQL)
- **Production domain (DO NOT TOUCH):** `astrum.my.salesforce.com`
- **Agentforce:** Licensed (confirmed by Amit)
- **Data Cloud:** Provisioned (confirmed by Amit)
- **Admin access:** Amit Asthana has full admin in PAR.

Every MCP tool call must target `par-sandbox`. Any host containing `astrum.my.salesforce.com` without `--astrumpar.sandbox` segment is production and must be refused.

## Phase status

| Phase | Status | Date | Notes |
|---|---|---|---|
| Phase 0 | ✅ Complete | 2026-05-13 | Docs, blueprint, env setup |
| Phase 1 | ✅ Complete | 2026-05-15 | Salesforce data model in PAR. Deploy ID `0AfUD00000H4XEv0AN`. SFDX project at `sfdx-project/`. |
| Phase 2 | ✅ Complete | 2026-05-15 | Railway worker writing Accounts/Sources/Signals to par-sandbox via Bulk API 2.0. Service: `insightful-empathy`. Cron: hourly regulatory (ClinicalTrials.gov), every 6h press RSS. |
| Phase 3 | ✅ Complete | 2026-05-15 | Deterministic scoring: Score_Snapshot__c inserted nightly, Account score fields updated. Nightly cron: 2am UTC. All 7 pilot accounts scored Hot (76–86). |
| Phase 4 | ✅ Complete | 2026-05-15 | Lightning app (Astrum_Lead_Agent), Account layout (Priority Score + Company Info sections), Hot & Warm Leads list view, Signals Inbox list view, Signal__c and BD_Action__c tabs. Deploy ID `0AfUD00000H4yYT0AZ`. Manual post-deploy: assign Account layout to profiles; add RecordType filter to Hot & Warm Leads list view in Setup. |
| Phase 5 | Not started | — | Pilot validation |

## Glossary
- **Signal** — a discrete, dated, sourced event suggesting a company is moving toward Phase I.
- **Target Company** — a biotech/pharma being tracked by Astrum BD.
- **Hot/Warm/Watch/Cold** — priority bands derived from Overall Priority Score.
- **Source** — the underlying evidence record (URL + raw payload) for one or more Signals.
