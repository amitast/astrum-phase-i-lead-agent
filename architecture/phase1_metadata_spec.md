# Phase 1 Metadata Spec — Astrum Lead Identification Agent

**Version:** 0.1 Draft  
**Date:** 2026-05-15  
**Status:** Pending Amit review — do not deploy until approved  
**Target org:** `par-sandbox` (`00DUD000007zF692AE`) only

---

## 0. Design decisions (from baseline)

| Decision | Resolution |
|---|---|
| Target Company object | Standard **Account** + new record type `Astrum_Target_Biotech` |
| `Therapeutic_Area__c` on Account | **Do not touch.** Existing field has 22 granular clinical values (e.g., "Neurology and CNS Disorders") incompatible with Astrum's broad priority TAs. Create new `Lead_Agent_TA__c` field instead. |
| `LinkedIn__c` on Account | **Reuse existing field.** Read-only in agent context. |
| Agentforce bot | **Reuse `Astrum BD Agent` (DeveloperName: `Astrum_BD_Agent`).** Add 3 new topics to it. |
| Worker deduplication on Account | Use new `Lead_Agent_External_Id__c` field (not `D365_Account_ID__c`). |
| Relationship type (Signal/Score/BD → Account) | **Lookup (nullable).** Avoids cascade delete; Sources can be standalone. |
| Picklist strategy | Local picklists on each field for MVP simplicity. |
| Bypass logic | Inherit existing `Bypass_Flow` custom permission + `Bypass_Flow_Testers` PS pattern. |

---

## 1. Account — new record type

| Property | Value |
|---|---|
| Label | Astrum Target Biotech |
| Developer Name | `Astrum_Target_Biotech` |
| Description | Record type for US biotech/pharma companies tracked by the Lead Identification Agent. |
| Available for | All profiles (access controlled via permission set) |

---

## 2. Account — new custom fields

All fields are new (no collisions). `Therapeutic_Area__c` and `LinkedIn__c` already exist — **do not recreate**.

### 2a. Classification fields

| # | API Name | Label | Type | Required | Notes |
|---|---|---|---|---|---|
| 1 | `Modality__c` | Modality | Picklist | No | See picklist values §2b |
| 2 | `Lead_Agent_TA__c` | Lead Agent TA | Picklist | No | Astrum's 4 priority TAs + Other + Unknown. Separate from existing `Therapeutic_Area__c` (clinical taxonomy — do not modify). |
| 3 | `Company_Stage__c` | Company Stage | Picklist | No | See picklist values §2b |
| 3 | `Is_US_HQ__c` | US HQ? | Checkbox | — | Default false; set by worker US filter |
| 4 | `HQ_Country__c` | HQ Country | Text(100) | No | ISO country name; "Unknown" routes to human triage |
| 5 | `Lead_Agent_Status__c` | Lead Agent Status | Picklist | No | Controls whether record is in scope for scoring |
| 6 | `Lead_Agent_External_Id__c` | Lead Agent External ID | Text(255) | No | External ID, Unique (case-insensitive); worker dedupe key |

### 2b. Scoring fields (written nightly by scoring worker; human read-only)

| # | API Name | Label | Type | Notes |
|---|---|---|---|---|
| 7 | `Phase_I_Readiness_Score__c` | Phase I Readiness Score | Number(5,2) | 0–100 |
| 8 | `Astrum_Fit_Score__c` | Astrum Fit Score | Number(5,2) | 0–100; formula §2c |
| 9 | `Timing_Score__c` | Timing Score | Number(5,2) | 0–100 |
| 10 | `Source_Confidence_Score__c` | Source Confidence Score | Number(5,2) | 0–100 |
| 11 | `Overall_Priority_Score__c` | Overall Priority Score | Number(5,2) | 0–100; composite |
| 12 | `Priority_Band__c` | Priority Band | Picklist | Derived from Overall score; set by worker |
| 13 | `Last_Signal_Date__c` | Last Signal Date | Date | Date of most recent non-rejected Signal |
| 14 | `Last_Score_Date__c` | Last Score Date | DateTime | When nightly score last ran |
| 15 | `Signal_Count__c` | Signal Count | Number(8,0) | Count of non-rejected Signals; worker-maintained |

### 2c. Picklist values for new Account fields

**`Modality__c`**
- Small molecule
- ADC
- Peptide
- Oligonucleotide
- Biosimilar
- Other
- Unknown *(default)*

**`Company_Stage__c`**
- Seed / Pre-Series A
- Series A
- Series B
- Series C
- Series D+
- Public
- Unknown *(default)*

**`Lead_Agent_Status__c`**
- Active *(default)*
- Archived

**`Priority_Band__c`** *(set programmatically — BD users do not edit)*
- Hot
- Warm
- Watch
- Cold
- Unscored *(default — before first nightly run)*

**`Lead_Agent_TA__c`** *(new field — do not modify existing `Therapeutic_Area__c`)*
- Oncology & Hematology
- CNS
- Immunology
- Cardiometabolic
- Other
- Unknown *(default)*

---

## 3. Signal__c

**Label:** Signal  
**Plural Label:** Signals  
**Description:** A discrete, dated, sourced event indicating a company is approaching Phase I clinical development.  
**Auto Number format:** SIG-{0000}

| # | API Name | Label | Type | Required | Notes |
|---|---|---|---|---|---|
| 1 | `Target_Company__c` | Target Company | Lookup(Account) | Yes | Relationship name: `Signals` |
| 2 | `Source__c` | Source | Lookup(Source__c) | Yes | The evidence record |
| 3 | `Signal_Type__c` | Signal Type | Picklist | Yes | See §3a |
| 4 | `Signal_Date__c` | Signal Date | Date | Yes | Date of the underlying event |
| 5 | `Status__c` | Status | Picklist | Yes | See §3a |
| 6 | `Modality__c` | Modality | Picklist | No | Modality this signal concerns |
| 7 | `Therapeutic_Area__c` | Therapeutic Area | Picklist | No | TA this signal concerns |
| 8 | `Company_Stage__c` | Company Stage at Signal | Picklist | No | Stage at time of this event |
| 9 | `Confidence__c` | Confidence | Picklist | Yes | Inherited from Source tier |
| 10 | `Classification_Source__c` | Classification Source | Picklist | Yes | Who/what classified this signal |
| 11 | `Signal_Summary__c` | Signal Summary | Long Text Area(32768) | No | Plain-English; AI-generated summaries must cite Source ID |
| 12 | `Dedupe_Hash__c` | Dedupe Hash | Text(64) | Yes | External ID, Unique (case-insensitive); SHA-256 of signal_type + account_id + signal_date + source_url |
| 13 | `Phase_I_Readiness_Weight__c` | Phase I Readiness Weight | Number(5,2) | No | 0–100; how much this signal type contributes to score (lookup table in worker) |
| 14 | `Reviewed_By__c` | Reviewed By | Lookup(User) | No | Human who set Status = Reviewed |
| 15 | `Reviewed_Date__c` | Reviewed Date | DateTime | No | When status was set to Reviewed |

### 3a. Signal__c picklist values

**`Signal_Type__c`**
- IND / IMPD Filing *(highest readiness weight — 100)*
- Trial Registration — ClinicalTrials.gov *(weight 90)*
- Funding Round *(weight 60)*
- Key Hire — CMO / VP Clinical *(weight 55)*
- Positive Preclinical Results *(weight 50)*
- Partnership / Licensing *(weight 40)*
- Regulatory Filing — Other *(weight 35)*
- Press Release — Other *(weight 20)*
- Other *(weight 10)*

**`Status__c`**
- New *(default)*
- Reviewed
- Rejected
- Archived

**`Confidence__c`**
- High *(Tier 1 — Regulatory)*
- Medium-High *(Tier 2 — Trade Press)*
- Medium *(Tier 3 — Aggregator)*
- Low *(Tier 4 — Social; excluded MVP)*

**`Classification_Source__c`**
- Worker — Deterministic
- Agentforce — AI Classified
- Human

**`Modality__c` / `Therapeutic_Area__c` / `Company_Stage__c`** — same values as Account fields (§2c).

---

## 4. Source__c

**Label:** Source  
**Plural Label:** Sources  
**Description:** The underlying evidence record (URL + raw payload) for one or more Signals. Immutable after creation.  
**Auto Number format:** SRC-{0000}

| # | API Name | Label | Type | Required | Notes |
|---|---|---|---|---|---|
| 1 | `URL__c` | Source URL | URL(255) | Yes | Validated client + server; must be unique |
| 2 | `Publisher__c` | Publisher | Picklist | Yes | See §4a |
| 3 | `Confidence_Tier__c` | Confidence Tier | Picklist | Yes | Drives Confidence__c on child Signals |
| 4 | `Publish_Date__c` | Publish Date | DateTime | No | When source was published by the publisher |
| 5 | `Fetch_Date__c` | Fetch Date | DateTime | Yes | When worker retrieved and stored this record |
| 6 | `Raw_Payload__c` | Raw Payload | Long Text Area(32768) | No | First 32 k of raw text; full payload in ContentVersion if larger |
| 7 | `Verification_Status__c` | Verification Status | Picklist | Yes | HTTP HEAD check status |
| 8 | `Last_Verified_Date__c` | Last Verified Date | DateTime | No | When nightly HEAD check last ran |
| 9 | `Account__c` | Account | Lookup(Account) | No | Optional manual link to Target Company Account |

### 4a. Source__c picklist values

**`Publisher__c`**
- ClinicalTrials.gov
- SEC EDGAR
- GlobeNewswire
- Google News
- FierceBiotech
- BioSpace
- Endpoints News
- Labiotech
- BusinessWire
- PR Newswire
- Other

**`Confidence_Tier__c`**
- Tier 1 — Regulatory
- Tier 2 — Trade Press
- Tier 3 — Aggregator

**`Verification_Status__c`**
- Unverified *(default)*
- Verified
- Broken

---

## 5. Score_Snapshot__c

**Label:** Score Snapshot  
**Plural Label:** Score Snapshots  
**Description:** Immutable daily snapshot of scoring for a Target Company. Never update — always insert.  
**Auto Number format:** SCR-{0000}

| # | API Name | Label | Type | Required | Notes |
|---|---|---|---|---|---|
| 1 | `Target_Company__c` | Target Company | Lookup(Account) | Yes | Relationship name: `Score_Snapshots` |
| 2 | `Snapshot_Date__c` | Snapshot Date | Date | Yes | Date of this scoring run |
| 3 | `Phase_I_Readiness_Score__c` | Phase I Readiness Score | Number(5,2) | Yes | |
| 4 | `Astrum_Fit_Score__c` | Astrum Fit Score | Number(5,2) | Yes | |
| 5 | `Timing_Score__c` | Timing Score | Number(5,2) | Yes | |
| 6 | `Source_Confidence_Score__c` | Source Confidence Score | Number(5,2) | Yes | |
| 7 | `Overall_Priority_Score__c` | Overall Priority Score | Number(5,2) | Yes | 0.40·PhaseI + 0.25·Fit + 0.20·Timing + 0.15·SourceConf |
| 8 | `Priority_Band__c` | Priority Band | Picklist | Yes | Hot / Warm / Watch / Cold |
| 9 | `Signals_Counted__c` | Signals Counted | Number(8,0) | Yes | Non-rejected Signals feeding this snapshot |
| 10 | `Reasoning_JSON__c` | Reasoning JSON | Long Text Area(32768) | No | JSON with signal-by-signal breakdown; human-readable debug |

**`Priority_Band__c`** picklist — same values as Account.Priority_Band__c (§2c), minus "Unscored".

---

## 6. BD_Action__c

**Label:** BD Action  
**Plural Label:** BD Actions  
**Description:** Agent-recommended or human-logged outreach action on a Target Company.  
**Auto Number format:** BDA-{0000}

| # | API Name | Label | Type | Required | Notes |
|---|---|---|---|---|---|
| 1 | `Target_Company__c` | Target Company | Lookup(Account) | Yes | Relationship name: `BD_Actions` |
| 2 | `Score_Snapshot__c` | Score Snapshot | Lookup(Score_Snapshot__c) | No | Snapshot that triggered this recommendation |
| 3 | `Recommended_Action__c` | Recommended Action | Picklist | Yes | See §6a |
| 4 | `Recommended_By__c` | Recommended By | Picklist | Yes | Agent or Human |
| 5 | `Status__c` | Status | Picklist | Yes | See §6a |
| 6 | `BD_Rep__c` | BD Rep | Lookup(User) | No | User who accepted / actioned |
| 7 | `Action_Date__c` | Action Date | Date | No | When the action was completed |
| 8 | `Notes__c` | Notes | Long Text Area(32768) | No | Human notes |

### 6a. BD_Action__c picklist values

**`Recommended_Action__c`**
- Initiate Outreach
- Follow Up
- Research Further
- No Action

**`Recommended_By__c`**
- Agent
- Human

**`Status__c`**
- Pending *(default)*
- Accepted
- Dismissed

---

## 7. Agent_Audit__c

**Label:** Agent Audit  
**Plural Label:** Agent Audit Records  
**Description:** One record per Agentforce invocation. Retained 24 months minimum. Hallucination flag set during weekly QA.  
**Auto Number format:** AUD-{0000}

| # | API Name | Label | Type | Required | Notes |
|---|---|---|---|---|---|
| 1 | `Invocation_Timestamp__c` | Invocation Timestamp | DateTime | Yes | |
| 2 | `Topic__c` | Topic | Picklist | Yes | Which Agentforce topic was called |
| 3 | `Model__c` | Model | Text(100) | No | e.g. `claude-sonnet-4-6` |
| 4 | `Input_Record_Ids__c` | Input Record IDs | Text(255) | No | Comma-separated SFDC Ids passed as input |
| 5 | `Prompt_Hash__c` | Prompt Hash | Text(64) | No | SHA-256 of full prompt (for deduplication / debugging) |
| 6 | `Output_Text__c` | Output Text | Long Text Area(32768) | Yes | Full agent output |
| 7 | `Source_Ids_Cited__c` | Source IDs Cited | Text(1300) | No | Comma-separated Source__c record Ids referenced in output |
| 8 | `Invoked_By__c` | Invoked By | Lookup(User) | No | User who triggered the invocation |
| 9 | `Hallucination_Flag__c` | Hallucination Flag | Checkbox | — | Default false; set true during weekly QA if output contains unsupported claim |
| 10 | `Hallucination_Notes__c` | Hallucination Notes | Long Text Area(2000) | No | Details of the hallucination if flagged |

### 7a. Agent_Audit__c picklist values

**`Topic__c`**
- Signal Classifier
- BD Briefer
- Scoring Explainer

---

## 8. Permission set — Astrum_Lead_Agent_User

**Name:** `Astrum_Lead_Agent_User`  
**Label:** Astrum Lead Agent User  
**Description:** Grants BD users read/write access to Lead Agent objects. Assign to BD reps and Zak during pilot.

| Object | CRUD | Notes |
|---|---|---|
| `Signal__c` | Read, Create, Edit | No Delete (archived via Status__c) |
| `Source__c` | Read, Create, Edit | No Delete |
| `Score_Snapshot__c` | Read only | Immutable — no Create/Edit/Delete |
| `BD_Action__c` | Read, Create, Edit | No Delete |
| `Agent_Audit__c` | Read only | Hallucination_Flag__c edit via separate field-level permission for QA role |
| `Account` | Read + field-level access to all Lead Agent fields | Does not grant create/delete on Account |

---

## 9. What to build vs reuse — summary

| Item | Action |
|---|---|
| `Signal__c` | **Create** |
| `Source__c` | **Create** |
| `Score_Snapshot__c` | **Create** |
| `BD_Action__c` | **Create** |
| `Agent_Audit__c` | **Create** |
| Account record type `Astrum_Target_Biotech` | **Create** |
| 15 new Account custom fields (§2a–2b) | **Create** |
| Permission set `Astrum_Lead_Agent_User` | **Create** |
| `Account.Lead_Agent_TA__c` | **Create** — new field with Astrum's 4 priority TAs |
| `Account.Therapeutic_Area__c` | **Do not touch** — existing 22-value clinical picklist preserved |
| `Account.LinkedIn__c` | **Reuse** — read-only in agent context |
| `Astrum BD Agent` (BotDefinition) | **Reuse** — add 3 topics in Phase 3 |
| `Bypass_Flow` custom permission | **Reuse** — reference in any Flows built in Phase 4 |

---

## 10. Deployment order (Phase 1)

1. ~~Inspect `Therapeutic_Area__c`~~ — **Done (2026-05-15).** Field has 22 clinical values incompatible with Astrum's TAs. New `Lead_Agent_TA__c` field created instead. No changes to existing field.
2. Create 5 custom objects (no dependencies between them except Source__c → Signal__c lookup, which deploys with Signal__c).
3. Create Account record type `Astrum_Target_Biotech`.
4. Create 15 Account custom fields.
5. Create permission set `Astrum_Lead_Agent_User` with object/field permissions.
6. Smoke test: create one Account (record type = Astrum_Target_Biotech), one Source__c, one Signal__c linked to both. Confirm all fields save correctly.
7. Update `par_sandbox_baseline.md` with deployed object Ids.

---

## 11. Assumptions in this spec

- [x] `Therapeutic_Area__c` picklist values inspected (2026-05-15) — 22 clinical values present; Astrum TAs use new `Lead_Agent_TA__c` field instead.
- [ ] `Modality__c` picklist values on Signal__c and Account use identical values — maintained manually in sync for MVP.
- [ ] Score_Snapshot__c records are never updated after creation (enforced by worker logic + object permission, not a Salesforce validation rule in MVP).
- [ ] `Dedupe_Hash__c` on Signal__c uniqueness enforced at API level; duplicate insert will return DUPLICATE_VALUE error which worker must handle.
- [ ] `Lead_Agent_External_Id__c` format: SHA-256 of (lowercased company name stripped to alphanumeric). Worker defines the exact normalisation.
