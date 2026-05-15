# PRD — Astrum Phase I Lead Identification Agent (Pilot)

**Version:** 0.2
**Date:** 2026-05-15
**Owner:** Amit Asthana
**Sponsor:** Catherine
**Status:** Ready for Phase 1 build — all blocking questions resolved

---

## 1. Problem statement
Astrum's BD team currently relies on Zak's manual, Claude-assisted scouting of public signals to identify biotech/pharma companies approaching Phase I. The process is talented but unscaled, unauditable, and disconnected from Salesforce/Orbit (the BD system of record). Outreach prioritisation is inconsistent and evidence is not systematically captured.

## 2. Objective
Deliver a Salesforce-native pilot agent that:
1. Continuously ingests US biotech/pharma signals from free, reliable public sources.
2. Classifies and scores companies for Phase I readiness, Astrum fit, and timing.
3. Surfaces a ranked, source-linked outreach queue inside Salesforce/Orbit.
4. Provides Catherine a testable framework before regional scale-up.

## 3. In scope (MVP)
- US biotech/pharma companies.
- Free sources only: ClinicalTrials.gov, SEC EDGAR, GlobeNewswire RSS, Google News RSS.
- 6 custom Salesforce objects + Signals Inbox UI.
- Deterministic scoring; no ML.
- Agentforce topics: Signal Classifier, BD Briefer, Scoring Explainer.
- Sandbox deployment.

## 4. Explicitly out of scope (MVP)
- Dashboards, biotech density map, prospecting map, events page.
- LinkedIn scraping or any paid enrichment.
- Non-US markets.
- Outbound automation (email, LinkedIn, dialler).
- ML or vector search.
- Production deployment.

## 5. Users & primary jobs-to-be-done
| User | JTBD |
|---|---|
| BD rep | "Tell me which US biotechs to call this week and why, with the source." |
| Catherine | "Show me whether the agent's Hot list outperforms our manual list over 4 weeks." |
| Zak | "Let me audit and override the agent's classifications without leaving Salesforce." |

## 6. Functional requirements
- **F1** External worker ingests sources on schedule (hourly for ClinicalTrials.gov + EDGAR; 4×/day for press RSS).
- **F2** Worker normalises and deduplicates Signals via hash (see Project Memory).
- **F3** Signals inserted into Salesforce via Bulk API with parent Source record.
- **F4** Deterministic scoring runs nightly; writes Score_Snapshot__c.
- **F5** Target Company record page shows latest scores, last 10 Signals, recommended BD Action.
- **F6** Agentforce Signal Classifier accepts a Source payload and returns {signal_type, company, modality, TA, confidence, source_id}.
- **F7** Agentforce BD Briefer accepts a Target Company Id and returns a 5-line brief citing Source Ids.
- **F8** Every agent invocation logged to Agent_Audit__c.
- **F9** Agent-created Signals require human "Reviewed" status before contributing to score.

## 7. Non-functional requirements
- **NFR1** No claim in any agent output without a corresponding Source Id.
- **NFR2** Median end-to-end latency from source publish → Salesforce visibility ≤ 2 hours.
- **NFR3** Worker can be paused without data loss.
- **NFR4** All sandbox; production gated by explicit Amit + Catherine approval.
- **NFR5** Token budget: agent calls per company per day ≤ 3 in steady state.

## 8. Success metrics (pilot, 4 weeks)
- **Precision (Hot band):** ≥70% of Hot-band companies judged "worth outreach" by Catherine on weekly review.
- **Recall vs Zak's manual list:** Agent surfaces ≥80% of companies Zak independently identifies.
- **Evidence integrity:** 100% of Signals have a working Source URL at end of pilot.
- **Hallucination rate:** ≤2% of Agent outputs contain a claim not in the cited Source (audited weekly).
- **BD adoption:** ≥1 BD rep uses Signals Inbox as primary daily view by week 4.

## 9. Risks
| Risk | Mitigation |
|---|---|
| Astrum org constraints unknown | Phase 0 discovery before any metadata creation |
| Free sources rate-limit or change | Multiple sources per signal type; manual fallback |
| Agentforce licence unclear | Confirm in Phase 0; design topics to be replaceable by Apex Prompt Templates |
| US filter false positives | Route ambiguous to human triage, never silently drop |
| BD doesn't adopt | Co-design Signals Inbox with Zak in Phase 4 |

## 10. Dependencies
- Salesforce sandbox access (TBD)
- Agentforce licence in sandbox (TBD)
- Hosting for ingestion worker (reuse Railway short-term)
- Catherine availability for weekly 30-min review during pilot

## 11. Confirmed inputs & resolved assumptions

### Confirmed by Catherine (2026-05-15)
| Parameter | Value |
|---|---|
| Modality priorities | Small molecule, ADC, Peptide, Oligonucleotide, Biosimilar |
| Therapeutic area priorities | Oncology & Hematology, CNS, Immunology, Cardiometabolic |
| Company stage sweet spot | Series A to Series C |

### Resolved by best practice (2026-05-15)
| Assumption | Resolution |
|---|---|
| Salesforce org + sandbox access | Confirmed — `par-sandbox` (Org Id `00DUD000007zF692AE`) |
| "Orbit" is Astrum's Salesforce instance | Confirmed — internal brand name only; no separate system |
| Agentforce licence in sandbox | Confirmed by Amit |
| BD pilot team size | 3 active BD reps (BP default for boutique CRO) |
| Hot-band capacity | ≤15 companies/week during pilot |
| BD will use Lightning app as daily tool | Assumed yes; validated in Phase 4 Signals Inbox design with Zak |

## 12. Scoring parameters (deterministic — Phase 1 design)

### Astrum Fit Score formula
`Astrum_Fit_Score = (modality_score × 0.40) + (TA_score × 0.40) + (stage_score × 0.20)`

| Sub-score | 100 | 50 | 0 |
|---|---|---|---|
| `modality_score` | Matches priority list | Unknown | No match |
| `TA_score` | Matches priority list | Unknown | No match |
| `stage_score` | Series A, B, or C | Pre-Series A or post-Series C | Unknown / not stated |

### Overall Priority Score formula (unchanged)
`Overall_Priority_Score = 0.40 × Phase_I_Readiness + 0.25 × Astrum_Fit + 0.20 × Timing + 0.15 × Source_Confidence`

Bands: Hot ≥75 · Warm 55–74 · Watch 35–54 · Cold <35
