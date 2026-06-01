# Astrum Phase I Lead Agent — Solution Layers

```mermaid
graph TB
    subgraph L1["① External Data Sources  (free, public)"]
        CT["🔬 ClinicalTrials.gov\nTrial registrations\nPulled hourly"]
        ED["📋 SEC EDGAR\nCompany enrichment\nStage · HQ country"]
        GN["📰 GlobeNewswire RSS\nFunding · press\nPulled every 6h"]
    end

    subgraph L2["② Ingestion Worker  (Railway · TypeScript)"]
        direction LR
        F["Fetch\n& Parse"] --> R["Region\nFilter\nUS/UK/EU"]
        R --> D["Dedupe\nhash check"]
        D --> S["Deterministic\nScoring\n0–100"]
        S --> P["Push\nBulk API 2.0\nREST PATCH"]
    end

    subgraph L3["③ Salesforce / Orbit  (System of Record)"]
        direction TB
        AC["Account\n(Target Company)\nScore · Band · Stage"]
        SI["Signal__c\nType · Date · Weight"]
        SO["Source__c\nURL · Confidence tier"]
        SS["Score_Snapshot__c\nHistory"]
        BD["BD_Action__c\nRep actions"]
        AU["Agent_Audit__c\nAI citations"]
        AC --- SI
        SI --- SO
        AC --- SS
        AC --- BD
        AC --- AU
    end

    subgraph L4["④ BD User Interface  (Lightning App)"]
        HL["🔴 Hot Leads\nPilot View\n13 accounts"]
        IN["📥 Signals Inbox\nList view"]
        AP["📄 Account\nRecord Page\nScore breakdown"]
    end

    subgraph L5["⑤ Claude Code Dev Tooling  (this session)"]
        direction LR
        A1["🔍 sf-schema-inspector\nVerify API names\nbefore any code"]
        A2["📊 sf-data-analyst\nSOQL queries\npilot summaries"]
        A3["📋 sf-deploy-planner\nDependency order\nchecklists"]
        HK["🔒 Hooks\nsession-start\npre-tool-guard\nstop-reminder"]
        VL["✅ Skills Validator\nauto-checks on\nevery session"]
    end

    CT --> F
    ED --> F
    GN --> F
    P -->|"Bulk API 2.0\n+ REST PATCH"| AC
    P --> SI
    P --> SO
    AC --> HL
    SI --> IN
    AC --> AP

    A1 -. "reads local\nSFDX XML" .-> L3
    A2 -. "SOQL →\npar-sandbox" .-> L3
    A3 -. "plans deploys\nto par-sandbox" .-> L3

    style L1 fill:#1a3a5c,stroke:#4a7ab5,color:#fff
    style L2 fill:#1a4a2e,stroke:#4ab57a,color:#fff
    style L3 fill:#3a1a5c,stroke:#7a4ab5,color:#fff
    style L4 fill:#4a2a1a,stroke:#b57a4a,color:#fff
    style L5 fill:#2a2a2a,stroke:#888,color:#fff
```

## Layer summary

| # | Layer | Technology | Purpose |
|---|---|---|---|
| ① | External Sources | ClinicalTrials.gov, EDGAR, GlobeNewswire | Raw signal data — free, public, no scraping |
| ② | Ingestion Worker | TypeScript / Node on Railway | Fetch, filter, dedupe, score, push |
| ③ | Salesforce / Orbit | 6 custom objects on PAR sandbox | System of record — companies, signals, scores, BD actions |
| ④ | BD User Interface | Lightning App + list views | Catherine and team review leads, log BD actions |
| ⑤ | Claude Code Tooling | Sub-agents, hooks, validator | Developer guard-rails and AI assistance for building on ③ |

## Data flow in one sentence
> Public trial and funding data is pulled hourly, scored deterministically, written to Salesforce, and surfaced to BD reps as a ranked list of Phase I prospects.
```
