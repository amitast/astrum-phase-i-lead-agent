# Solution Architecture — Astrum Phase I Lead Agent

**Version:** 0.1 Draft
**Date:** 2026-05-13

---

## 1. Architecture overview

```
   ┌─────────────────────────┐
   │  Public Sources         │
   │  - ClinicalTrials.gov   │
   │  - SEC EDGAR            │
   │  - GlobeNewswire RSS    │
   │  - Google News RSS      │
   │  (Tier 2 trade press    │
   │   added Phase 3)        │
   └────────────┬────────────┘
                │  pull (HTTP, RSS, API)
                ▼
   ┌─────────────────────────┐
   │ Ingestion Worker        │
   │ (Node/Python, Railway)  │
   │  - fetch & normalise    │
   │  - dedupe via hash      │
   │  - US filter            │
   │  - deterministic        │
   │    scoring              │
   └────────────┬────────────┘
                │  Salesforce Bulk API 2.0
                ▼
   ┌─────────────────────────────────────────┐
   │ Salesforce / Orbit (system of record)   │
   │  ┌────────────────┐  ┌────────────────┐ │
   │  │ Target_Company │←─│ Score_Snapshot │ │
   │  └───────┬────────┘  └────────────────┘ │
   │          │                              │
   │   ┌──────┴──────┐                       │
   │   │  Signal__c  │──→ Source__c          │
   │   └─────────────┘                       │
   │                                         │
   │   BD_Action__c   Agent_Audit__c         │
   │                                         │
   │   Agentforce Topics:                    │
   │   - Signal Classifier (text → fields)   │
   │   - BD Briefer (record → 5-line brief)  │
   │   - Scoring Explainer                   │
   │                                         │
   │   Lightning App: Signals Inbox          │
   └─────────────────────────────────────────┘
```

## 2. Component responsibilities

### 2.1 Salesforce / Orbit
- Single source of truth for Target Companies, Signals, Sources, Scores, BD Actions, Audit.
- Hosts Agentforce topics and a Lightning "Signals Inbox" app.
- Owns RBAC via permission set `Astrum_Lead_Agent_User`.
- Owns workflow state transitions on Signal__c.

### 2.2 Ingestion Worker (external)
- Stateless service running on Railway (MVP) or AWS Lambda (post-pilot).
- Cron-driven: hourly for regulatory sources, 4×/day for press RSS.
- Responsibilities:
  - Fetch and parse.
  - Apply US filter.
  - Compute dedupe hash; check Salesforce for existing.
  - Compute deterministic scores.
  - Push to Salesforce via Bulk API.
- Failures: write to a dead-letter queue (DLQ) table; retry with exponential backoff; alert on >3 consecutive failures.

### 2.3 Agentforce / AI
Three narrow topics. Each topic has tightly scoped instructions and only receives data passed in by Apex actions — no open web access.

| Topic | Input | Output | Guardrails |
|---|---|---|---|
| Signal Classifier | Raw Source text + URL | Signal type, company, modality, TA, confidence, source_id | Must cite source; unknown = "not stated" |
| BD Briefer | Target Company Id | 5-line brief with inline [Source: SRC-####] cites | Reads only stored fields + linked Sources |
| Scoring Explainer | Target Company Id | Plain-English explanation of latest Score_Snapshot__c | No re-scoring; reads stored values only |

### 2.4 Data storage & audit
- All persistent data in Salesforce.
- Raw scraped payload stored on Source__c.Raw_Payload__c (Long Text 32k); >32k stored as ContentVersion attachment.
- Agent_Audit__c row per agent invocation: prompt hash, model, input record Ids, output, user, timestamp, hallucination_flag (bool, set by weekly QA review).
- Score history immutable: never UPDATE Score_Snapshot__c, always INSERT.

### 2.5 Source verification
- URL field validated client + server side.
- Nightly Apex batch performs HTTP HEAD on Source.URL__c; failed → `Verification_Status__c = Broken`, flagged in Signals Inbox.
- Confidence tier set at ingestion from publisher; overridable by human.

## 3. Security & compliance
- All credentials in Salesforce Named Credentials or Railway env vars (never in repo).
- No PII ingested beyond names of public executives in press releases.
- Audit object retained 24 months minimum.
- No model fine-tuning on customer data.

## 4. Failure modes & responses
| Failure | Detection | Response |
|---|---|---|
| Source feed down | Worker 3× retry fail | DLQ + Slack alert; manual fallback |
| Salesforce API limit hit | Bulk API error 4XX | Backoff; spread inserts; alert |
| Agent hallucination rate >5% | Weekly QA on Agent_Audit__c | Auto-disable topic via Flow |
| Duplicate Signals | Pre-insert hash check | Reject silently; log to worker telemetry |

## 5. Deployment topology
- **Sandbox (Dev):** all build & test.
- **Sandbox (UAT):** Catherine + Zak pilot.
- **Production:** explicit Amit + Catherine approval; staged rollout to 1 BD rep first.

## 6. Architecture decisions (resolved 2026-05-15)

| Question | Decision | Rationale |
|---|---|---|
| Agentforce licence | **Confirmed** — licensed in PAR sandbox. Prompt Templates fallback is designed but not needed. | Confirmed by Amit 2026-05-13 |
| Long-term ingestion worker home | **Railway for MVP; AWS Lambda post-pilot.** Defer migration until pilot passes validation gates. | Minimise infrastructure change during pilot |
| Source__c → Account link | **Standalone in MVP.** Add an optional `Account__c` lookup field on `Source__c` that BD can populate manually. Evaluate full linkage in Phase 4 once Account record type is finalised. | Avoids coupling to Account model before record type is locked |

## 7. Astrum fit scoring parameters (deterministic)

Modality priorities (confirmed by Catherine 2026-05-15): Small molecule, ADC, Peptide, Oligonucleotide, Biosimilar.  
TA priorities: Oncology & Hematology, CNS, Immunology, Cardiometabolic.  
Stage sweet spot: Series A to Series C.

`Astrum_Fit_Score = (modality_score × 0.40) + (TA_score × 0.40) + (stage_score × 0.20)`

| Sub-score | 100 | 50 | 0 |
|---|---|---|---|
| modality | Matches priority list | Unknown / not stated | No match |
| TA | Matches priority list | Unknown / not stated | No match |
| stage | Series A, B, or C | Pre-Series A or post-Series C | Unknown |

These values are stored as picklist fields and compared deterministically — no LLM inference at scoring time.
