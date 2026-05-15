# Astrum Phase I Lead Agent — Project Memory

> Long-lived context for Claude Code sessions. Load this file at the start of every working session.
> Last updated: 2026-05-15 (end-of-day)

---

## Project Goal
Build a Salesforce/Orbit-native agentic Lead Generation system that formalises and scales Zak's current manual/Claude-assisted signal-scouting work. Pilot focus: **US, UK, and EU biotech/pharma companies signalling a move into Phase I clinical development.**

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

## Region filter (canonical)

**ClinicalTrials.gov ingestion** passes through companies classified as US, UK, or EU; drops `Other` (Asia, LatAm, etc.); passes `Unknown` through for human triage.
- Implemented in `worker/src/utils/usFilter.ts`: `classifyRegion()` function.
- EU list includes all 27 member states + Switzerland, Norway, Iceland (key biotech hubs).

**`Is_US_HQ__c` field** remains a US-only flag (`true` = confirmed US legal entity via EDGAR).
- Set by `classifyUsHq()` at ingestion time (trial location).
- **Overridden** by EDGAR enrichment pass if EDGAR returns a `billingCountry` — EDGAR is the authoritative source.
- Limitation: EDGAR shows the SEC-registered entity address, so international companies listed on US exchanges (AstraZeneca, Roche, Novo Nordisk) show `Is_US_HQ__c = true` even though their global HQ is abroad.

**GlobeNewswire** has no region filter — all companies pass through.

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
| Phase 2 | ✅ Complete | 2026-05-15 | Railway worker writing Accounts/Sources/Signals to par-sandbox via Bulk API 2.0. Service: `insightful-empathy`. Cron: hourly regulatory (ClinicalTrials.gov), every 6h press RSS. Lookback: 30 days (env var `LOOKBACK_DAYS=30`). |
| Phase 3 | ✅ Complete | 2026-05-15 | Deterministic scoring live. 47 accounts scored (30-day pull). Bands: 13 Hot, 31 Warm, 3 Watch. Score_Breakdown__c field written via REST PATCH (Bulk API drops multiline). Nightly cron: 2am UTC. |
| Phase 4 | ✅ Complete | 2026-05-15 | Lightning app, Account layout (Priority Score + Company Info + Location + System sections), Score_Breakdown__c field, Hot & Warm Leads list view, Hot Leads — Pilot list view, Signals Inbox list view, Signal__c and BD_Action__c tabs. |
| Phase 5 | 🔄 In Progress | 2026-05-15 | Pilot validation begun. Score recalibration complete (threshold 75→92, account stage fallback). Hot Leads — Pilot list view shows 13 accounts for Catherine's first review. Next: Catherine weekly review session. |

## Scoring model (current weights — approved by Catherine, recalibrated 2026-05-15)

### Formula
```
Overall Priority Score = (Phase I Readiness × 0.40) + (Astrum Fit × 0.25) + (Timing × 0.20) + (Source Confidence × 0.15)
```

### Priority bands (recalibrated 2026-05-15)
| Band | Threshold | Rationale |
|---|---|---|
| Hot | ≥ 92 | EDGAR-confirmed stage + preferred TA/modality (93.5 for Public; 96 for Series A-C) |
| Warm | 75–91 | Trial Registration with Unknown stage (private biotechs not in EDGAR) |
| Watch | 55–74 | Lower confidence signal or non-priority TA/modality |
| Cold | < 55 | Minimal signal |

**Original threshold was 75 for Hot.** Raised to 92 to separate EDGAR-enriched public companies from unknown-stage private biotechs; all ClinicalTrials.gov signals for Oncology/Small molecule with Unknown stage score exactly 91.

### Phase I Readiness weights (signal type)
IND/IMPD Filing: 1.00 | Trial Registration: 0.90 | Funding Round: 0.60 | Key Hire: 0.55 | Positive Preclinical: 0.50 | Partnership/Licensing: 0.40 | Regulatory Filing-Other: 0.35 | Press Release-Other: 0.20 | Other: 0.10

### Astrum Fit sub-scores
- **Modality** (×0.40): Small molecule/ADC/Peptide/Oligonucleotide/Biosimilar = 100; Unknown = 50; Other = 0
- **TA** (×0.40): Oncology & Hematology/CNS/Immunology/Cardiometabolic = 100; Unknown = 50; Other = 0
- **Stage** (×0.20): Series A/B/C = 100; Seed/Pre-Series A/Series D+/Public = 50; Unknown = 0
  - **Stage source priority:** signal's `Company_Stage__c` first; if Unknown, falls back to `Account.Company_Stage__c` (EDGAR-enriched). Implemented in `scoreWriter.ts`.

### Score compression known issue
ClinicalTrials.gov signals always carry `Company_Stage__c = 'Unknown'` (CT.gov doesn't publish stage). Private biotechs not found in EDGAR also stay Unknown. Until GlobeNewswire funding signals or EDGAR Form D ingestion adds stage data, private biotechs will cluster at 91 (Warm band).

## Railway worker — key facts
- **Service name:** `insightful-empathy`
- **Project:** `astrum-lead-agent-worker`
- **Deploy command:** `railway up --detach --service insightful-empathy` from `worker/`
- **Logs:** `railway logs --deployment <id>`
- **Env vars:** `LOOKBACK_DAYS=30`, `SF_USERNAME`, `SF_CLIENT_ID`, `SF_PRIVATE_KEY_B64`, `SF_LOGIN_URL`, `SF_ACCOUNT_RECORD_TYPE_ID`
- **Schedule:** Regulatory hourly (`0 * * * *`), Press RSS every 6h (`0 */6 * * *`), Scoring nightly 2am UTC (`0 2 * * *`)
- **Scoring runs on startup** (in addition to nightly cron) — use this for immediate re-scoring after code changes

## Key technical constraints (hard-won learnings)

### Salesforce Bulk API V2 — multiline field values
Bulk API V2 silently drops field values containing actual newlines (`\n`), even with correct RFC 4180 CSV quoting. Reports `processed: N, failed: 0`. Use REST PATCH (`axios.patch`) for any LongTextArea field written by the worker. Affects: `Score_Breakdown__c`.

### Salesforce compound address FLS
Standard compound address sub-fields (BillingCity, BillingStreet, etc.) cannot be granted FLS via permission sets. Must be enabled at the **profile** level: Setup → Profiles → Minimum Access - Salesforce → Object Settings → Account → enable Address fields.

### EDGAR enrichment — public companies only
SEC EDGAR only contains companies that have filed with the SEC (primarily US-listed public companies + some private companies with Form D filings). Private Series A-C biotechs (Astrum's sweet spot) are usually not found. EDGAR returns the SEC-registered entity address — international companies listed on US exchanges show US addresses.

### FlexiPage tab defaults
`active: true` on `flexipage:tab` sets the default tab. `selectedTab` is NOT a valid property on `flexipage:tabset` (deploy error). Salesforce Lightning persists user tab preferences and overrides page defaults.

## Current data state (2026-05-15)
- **47 Accounts** in PAR sandbox with RecordType = Astrum Target Biotech
- **56 Signals** across all accounts (30-day ClinicalTrials.gov lookback)
- **Scoring bands:** 13 Hot, 31 Warm, 3 Watch, 0 Cold
- **Hot leads (pilot list):** 13 companies, all EDGAR-confirmed Public stage, score 93.5
  - Mix of large pharma (Amgen, AstraZeneca, Genentech) and smaller biotechs (BlueSphere Bio, Faeth, Relay, Immunome, Context Therapeutics)
- **Warm leads:** ~31 private biotechs with Unknown stage (score 91)
- **Known data quality issue:** Large pharma in Hot band (Amgen, AstraZeneca, etc.) are unlikely Astrum targets. Catherine's first review will calibrate whether Public-stage companies should be downgraded.

## Glossary
- **Signal** — a discrete, dated, sourced event suggesting a company is moving toward Phase I.
- **Target Company** — a biotech/pharma being tracked by Astrum BD.
- **Hot/Warm/Watch/Cold** — priority bands derived from Overall Priority Score.
- **Source** — the underlying evidence record (URL + raw payload) for one or more Signals.
