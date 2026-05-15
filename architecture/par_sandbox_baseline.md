# PAR Sandbox Baseline — Astrum CRO

**Captured:** 2026-05-13  
**Phase 1 deployed:** 2026-05-15 — Deploy ID `0AfUD00000H4XEv0AN`, 75/75 components, Status: Succeeded
**Captured by:** Amit (via Claude Code + Salesforce MCP)
**Purpose:** Snapshot of relevant PAR sandbox state before Phase 1 metadata design, so we can detect collisions and reference the starting point throughout the project.

---

## Org identity (confirmed via SOQL `SELECT ... FROM Organization`)

| Field | Value |
|---|---|
| Org Id | `00DUD000007zF692AE` |
| Org Name | ASTRUM CRO, SL |
| `IsSandbox` | **true** |
| Instance | SWE92S |
| Alias | `par-sandbox` |
| Username | `amit.kumar@astrumcro.com.astrumpar` |
| Instance URL | `https://astrum--astrumpar.sandbox.my.salesforce.com` |
| Sandbox name | `astrumpar` |

---

## Existing custom objects in PAR (5 total)

| API Name | Label | Notes |
|---|---|---|
| `AccountCode__c` | Account Code | Unrelated to lead agent scope |
| `Employee__c` | Employee | Unrelated |
| `In_App_Checklist_Settings__c` | In App Checklist Settings | Unrelated |
| `OpportunityAutoNumber__c` | Opportunity Auto Number | Unrelated |
| `Vendor__c` | Vendor | Unrelated |

**Phase 1 objects — deployed 2026-05-15 (all confirmed queryable via SOQL):**

| Object | Auto# | Record Id (RecordType where applicable) |
|---|---|---|
| `Signal__c` | SIG-{0000} | Deployed ✅ |
| `Source__c` | SRC-{0000} | Deployed ✅ |
| `Score_Snapshot__c` | SCR-{0000} | Deployed ✅ |
| `BD_Action__c` | BDA-{0000} | Deployed ✅ |
| `Agent_Audit__c` | AUD-{0000} | Deployed ✅ |

**Account record type `Astrum_Target_Biotech`** — Id `012UD000004JErNYAW`, Active ✅  
**Permission set `Astrum_Lead_Agent_User`** — Id `0PSUD0000013U4D4AU` ✅  
**16 Account custom fields** — all Created ✅ (see phase1_metadata_spec.md §2)

**Phase 2 components — deployed 2026-05-15 (Deploy ID `0AfUD00000H4SFG0A3`):**

| Component | Type | Status |
|---|---|---|
| `Astrum_Lead_Agent_JWT` | Certificate | Created ✅ |
| `Astrum_Lead_Agent_Worker` | Connected App | Created ✅ |

**Pending (manual Setup UI steps):**
- [ ] Consumer Key — retrieve from Setup → Apps → App Manager → Astrum Lead Agent Worker → View
- [ ] Integration user `leadagent@astrumcro.com.astrumpar` — create in Setup → Users (Profile: Minimum Access, assign PS: Astrum_Lead_Agent_User)
- [ ] Grant Connected App access to integration user (Setup → Apps → Manage → Astrum Lead Agent Worker → Manage Permission Sets)

---

## Method note (SOQL gotcha for future sessions)

The query `WHERE QualifiedApiName LIKE '%\_\_c' ESCAPE '\'` does NOT work as expected against `EntityDefinition` — SOQL's `LIKE` does not honour `ESCAPE` for underscore in this context. The `_` is treated as a single-character wildcard, sweeping in platform internal objects like `ActivityMetric`, `OrgMetric`, `PushTopic`, `AIMetric`.

**Correct pattern for "real custom objects" going forward:**

```soql
SELECT QualifiedApiName, Label
FROM EntityDefinition
WHERE IsCustomSetting = false
  AND IsCustomizable = true
  AND QualifiedApiName LIKE '%__c'
  AND PublisherId = '<This org>'
ORDER BY QualifiedApiName
```

Or simply post-filter in code: keep only rows whose API name ends with literal `__c` AND does not contain platform-internal prefixes. For the baseline capture, manual filtering was applied — result above is verified.

---

## Phase 1 baseline capture (2026-05-15)

### Account record types
**Result: zero record types defined.** Account is a clean slate — safe to create `Astrum_Target_Biotech` record type.

---

### Account custom fields (14 returned, incl. 2 standard SIC fields)

| API Name | Label | Type | Lead Agent implication |
|---|---|---|---|
| `Account_Code__c` | Account Code | Text(255) | Unrelated — no conflict |
| `Account_Segment__c` | Account Segment | Picklist | Unrelated to our Priority Band — no conflict |
| `Client_Type__c` | Client Type | Picklist | May be useful for biotech vs pharma tag — no conflict with new fields |
| `D365_Account_ID__c` | D365 Account ID | Text(255), External ID, Unique | D365 integration active. **Do not create a conflicting External ID.** Worker uses SFDC internal Id as anchor. |
| `D365_Account_Notes__c` | D365 Account Notes | Long Text(32768) | Unrelated |
| `D365_Account_owner__c` | D365 Account owner | Text(255) | Unrelated |
| `LinkedIn__c` | LinkedIn | Text(255) | Already exists — **do not create duplicate.** Lead agent can read this field for BD context. |
| `Number_Employees__c` | Number Employees | Picklist | Unrelated |
| `Ownership__c` | Ownership | Picklist | Unrelated to company stage picklist |
| `Sequence__c` | Sequence | Auto Number | Unrelated |
| `Therapeutic_Area__c` | Therapeutic Area | **Picklist** | **⚠ ALREADY EXISTS — REUSE.** Add Astrum priority TA values to existing picklist during Phase 1 deploy. Do not create a duplicate field. |
| `Tier_Category__c` | Tier Category | Picklist | Unrelated |

**Picklist values for `Therapeutic_Area__c`**: Cannot be retrieved via SOQL in this API version. Must inspect via Setup UI or `sf sobject describe` before deploying to confirm whether Astrum priority TAs (Oncology & Hematology, CNS, Immunology, Cardiometabolic) are already present.

**Safe to create (no collision):** `Modality__c`, `Company_Stage__c`, `Priority_Band__c`, `Country__c`, `Phase_I_Readiness_Score__c`, `Astrum_Fit_Score__c`, `Timing_Score__c`, `Source_Confidence_Score__c`, `Overall_Priority_Score__c`, `Last_Signal_Date__c`, `Is_US_HQ__c`, `Lead_Agent_Status__c`.

---

### Permission sets (36 custom)

Key sets relevant to Lead Agent:

| Name | Label | Note |
|---|---|---|
| `Astrum_BD_Agent_PS` | Astrum BD Agent | Already exists for the Agentforce BD Agent. **Do not reuse — create separate `Astrum_Lead_Agent_User` PS to scope cleanly.** |
| `Bypass_Flow_Testers` | Bypass Flow Testers | Bypass_Flow custom permission already wired up — reuse this pattern for our bypass logic. |
| `Agent_Access` | Agent Access | General agent access PS — no conflict |
| `SDR_Agent1919927630_Permissions` | SDR_Agent Permissions | Auto-generated for SDR Agent user — unrelated |

---

### Agentforce agents (BotDefinition — 4 total)

| DeveloperName | MasterLabel | Implication |
|---|---|---|
| `Copilot_for_Salesforce` | Agentforce (Default) | Platform default — do not modify |
| `Astrum_BD_Agent` | **Astrum BD Agent** | **Already exists.** Our 3 new topics (Signal Classifier, BD Briefer, Scoring Explainer) will be added to this agent — not a new bot. |
| `Agentforce_Sales_Development_Rep` | Astrum Lead Nurturing Agent | Existing SDR/nurturing agent — unrelated |
| `Sales_Representative_Agent` | Sales Representative Agent | Unrelated |

---

### Items deferred (still needed, not yet captured)

- [ ] Picklist values for `Therapeutic_Area__c` — inspect via Setup UI before Phase 1 deploy
- [ ] `Account_Segment__c` picklist values — inspect; may be useful context for record type scoping
- [ ] `Client_Type__c` picklist values — inspect
- [ ] Data Cloud data spaces and data streams — needed before Phase 3
- [ ] Connected Apps — needed before Phase 2 (worker auth)
- [ ] API/integration user setup — needed before Phase 2

---

## Implication for Phase 1

PAR sandbox is effectively a **clean slate** for Lead Agent custom objects. Key constraints identified:

1. **`Therapeutic_Area__c` already exists on Account** — reuse; add Astrum TA picklist values.
2. **`Astrum BD Agent` already exists** — add our Agentforce topics to it; no new bot needed.
3. **D365 integration is active** — do not create conflicting External IDs on Account; worker anchors on SFDC internal Id.
4. **`LinkedIn__c` already exists** — read-only in agent context; no new field needed.
5. **Bypass_Flow pattern already established** — reuse `Bypass_Flow` custom permission.
