import axios from 'axios';
import { getSalesforceAuth } from '../salesforce/auth.js';

const API_VERSION = '61.0';
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 40;

// ── Scoring tables ──────────────────────────────────────────────────────────

const PHASE_I_READINESS_WEIGHT: Record<string, number> = {
  'IND/IMPD Filing':           1.00,
  'Trial Registration':        0.90,
  'Funding Round':             0.60,
  'Key Hire':                  0.55,
  'Positive Preclinical':      0.50,
  'Partnership/Licensing':     0.40,
  'Regulatory Filing-Other':   0.35,
  'Press Release-Other':       0.20,
  'Other':                     0.10,
};

const MODALITY_SCORE: Record<string, number> = {
  'Small molecule': 100, 'ADC': 100, 'Peptide': 100,
  'Oligonucleotide': 100, 'Biosimilar': 100,
  'Unknown': 50, 'Other': 0,
};

const TA_SCORE: Record<string, number> = {
  'Oncology & Hematology': 100, 'CNS': 100,
  'Immunology': 100, 'Cardiometabolic': 100,
  'Unknown': 50, 'Other': 0,
};

const STAGE_SCORE: Record<string, number> = {
  'Series A': 100, 'Series B': 100, 'Series C': 100,
  'Seed/Pre-Series A': 50, 'Series D+': 50, 'Public': 50,
  'Unknown': 0,
};

const SOURCE_CONFIDENCE_SCORE: Record<string, number> = {
  'Tier 1-Regulatory': 100, 'Tier 2-Trade Press': 75, 'Tier 3-Aggregator': 50,
};

// ── Types ───────────────────────────────────────────────────────────────────

interface SignalRow {
  Target_Company__c: string;
  Target_Company__r?: { Lead_Agent_External_Id__c?: string };
  Signal_Type__c: string;
  Signal_Date__c: string;
  Modality__c: string;
  Therapeutic_Area__c: string;
  Company_Stage__c: string;
  Phase_I_Readiness_Weight__c: number;
  Source__r?: { Confidence_Tier__c?: string };
}

interface AccountScore {
  accountId: string;
  externalId: string;
  phaseIReadinessScore: number;
  astrumFitScore: number;
  timingScore: number;
  sourceConfidenceScore: number;
  overallPriorityScore: number;
  priorityBand: string;
  signalCount: number;
  latestSignalDate: string;
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function runScoringPass(): Promise<void> {
  const { accessToken, instanceUrl } = await getSalesforceAuth();
  const baseUrl = `${instanceUrl}/services/data/v${API_VERSION}`;
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  console.log('[scoring] Querying all signals from Salesforce…');

  const soql = [
    'SELECT Target_Company__c, Target_Company__r.Lead_Agent_External_Id__c,',
    'Signal_Type__c, Signal_Date__c, Modality__c, Therapeutic_Area__c,',
    'Company_Stage__c, Phase_I_Readiness_Weight__c, Source__r.Confidence_Tier__c',
    'FROM Signal__c WHERE Target_Company__c != null',
    'ORDER BY Target_Company__c, Signal_Date__c DESC',
  ].join(' ');

  const { data } = await axios.get<{ records: SignalRow[]; totalSize: number }>(
    `${baseUrl}/query`,
    { headers, params: { q: soql } },
  );

  console.log(`[scoring] ${data.totalSize} signals retrieved`);
  if (data.totalSize === 0) return;

  // Group by account
  const byAccount = new Map<string, SignalRow[]>();
  for (const row of data.records) {
    const list = byAccount.get(row.Target_Company__c) ?? [];
    list.push(row);
    byAccount.set(row.Target_Company__c, list);
  }

  // Compute scores
  const scores: AccountScore[] = [];
  for (const [accountId, signals] of byAccount) {
    scores.push(aggregateScore(accountId, signals));
  }

  const today = new Date().toISOString().slice(0, 10);
  console.log(`[scoring] Computed scores for ${scores.length} accounts`);

  // Insert Score_Snapshot__c (one per account per scoring run — AutoNumber name)
  await bulkInsert(baseUrl, headers, 'Score_Snapshot__c', scores.map(s => ({
    Target_Company__c:          s.accountId,
    Snapshot_Date__c:           today,
    Phase_I_Readiness_Score__c: s.phaseIReadinessScore,
    Astrum_Fit_Score__c:        s.astrumFitScore,
    Timing_Score__c:            s.timingScore,
    Source_Confidence_Score__c: s.sourceConfidenceScore,
    Overall_Priority_Score__c:  s.overallPriorityScore,
    Priority_Band__c:           s.priorityBand,
    Signals_Counted__c:         s.signalCount,
    Reasoning_JSON__c: JSON.stringify({
      phaseI:      s.phaseIReadinessScore,
      astrumFit:   s.astrumFitScore,
      timing:      s.timingScore,
      sourceConf:  s.sourceConfidenceScore,
      latestSignal: s.latestSignalDate,
      signalCount:  s.signalCount,
    }),
  })));

  // Update Account score fields via upsert on Lead_Agent_External_Id__c
  const accountUpdates = scores
    .filter(s => s.externalId)
    .map(s => ({
      Lead_Agent_External_Id__c:  s.externalId,
      Phase_I_Readiness_Score__c: s.phaseIReadinessScore,
      Astrum_Fit_Score__c:        s.astrumFitScore,
      Timing_Score__c:            s.timingScore,
      Source_Confidence_Score__c: s.sourceConfidenceScore,
      Overall_Priority_Score__c:  s.overallPriorityScore,
      Priority_Band__c:           s.priorityBand,
      Signal_Count__c:            s.signalCount,
      Last_Signal_Date__c:        s.latestSignalDate,
      Last_Score_Date__c:         `${today}T00:00:00.000Z`,
    }));

  if (accountUpdates.length > 0) {
    await bulkUpsert(baseUrl, headers, 'Account', 'Lead_Agent_External_Id__c', accountUpdates);
  }

  const bandSummary = bandCounts(scores);
  console.log(`[scoring] Done — ${scores.length} accounts scored. Bands: ${bandSummary}`);
}

// ── Scoring helpers ─────────────────────────────────────────────────────────

function aggregateScore(accountId: string, signals: SignalRow[]): AccountScore {
  const externalId = signals[0]?.Target_Company__r?.Lead_Agent_External_Id__c ?? '';
  let maxPhaseI = 0;
  let maxAstrumFit = 0;
  let maxSourceConf = 0;
  let latestSignalDate = '';

  for (const sig of signals) {
    const phaseIWeight = PHASE_I_READINESS_WEIGHT[sig.Signal_Type__c] ?? 0.10;
    maxPhaseI = Math.max(maxPhaseI, phaseIWeight);

    const modalityScore = MODALITY_SCORE[sig.Modality__c] ?? 0;
    const taScore       = TA_SCORE[sig.Therapeutic_Area__c] ?? 0;
    const stageScore    = STAGE_SCORE[sig.Company_Stage__c] ?? 0;
    const astrumFit     = (modalityScore * 0.40) + (taScore * 0.40) + (stageScore * 0.20);
    maxAstrumFit = Math.max(maxAstrumFit, astrumFit);

    const confTier = sig.Source__r?.Confidence_Tier__c ?? 'Tier 3-Aggregator';
    maxSourceConf = Math.max(maxSourceConf, SOURCE_CONFIDENCE_SCORE[confTier] ?? 50);

    if (!latestSignalDate || sig.Signal_Date__c > latestSignalDate) {
      latestSignalDate = sig.Signal_Date__c;
    }
  }

  const phaseIReadinessScore  = r2(maxPhaseI * 100);
  const astrumFitScore        = r2(maxAstrumFit);
  const timingScore           = computeTimingScore(latestSignalDate);
  const sourceConfidenceScore = maxSourceConf;
  const overallPriorityScore  = r2(
    (phaseIReadinessScore  * 0.40) +
    (astrumFitScore        * 0.25) +
    (timingScore           * 0.20) +
    (sourceConfidenceScore * 0.15),
  );

  return {
    accountId,
    externalId,
    phaseIReadinessScore,
    astrumFitScore,
    timingScore,
    sourceConfidenceScore,
    overallPriorityScore,
    priorityBand: band(overallPriorityScore),
    signalCount: signals.length,
    latestSignalDate,
  };
}

function computeTimingScore(dateStr: string): number {
  if (!dateStr) return 0;
  const ageDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (ageDays <= 30)  return 100;
  if (ageDays <= 90)  return 75;
  if (ageDays <= 180) return 50;
  if (ageDays <= 365) return 25;
  return 0;
}

function band(score: number): string {
  if (score >= 75) return 'Hot';
  if (score >= 55) return 'Warm';
  if (score >= 35) return 'Watch';
  return 'Cold';
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function bandCounts(scores: AccountScore[]): string {
  const c = { Hot: 0, Warm: 0, Watch: 0, Cold: 0 } as Record<string, number>;
  for (const s of scores) c[s.priorityBand] = (c[s.priorityBand] ?? 0) + 1;
  return Object.entries(c).map(([k, v]) => `${k}:${v}`).join(' ');
}

// ── Bulk API helpers ────────────────────────────────────────────────────────

async function bulkInsert(
  baseUrl: string,
  headers: Record<string, string>,
  objectName: string,
  records: Record<string, unknown>[],
): Promise<void> {
  if (records.length === 0) return;
  console.log(`[scoring] Inserting ${records.length} ${objectName} records…`);
  const { data: job } = await axios.post<{ id: string }>(
    `${baseUrl}/jobs/ingest`,
    { object: objectName, operation: 'insert', contentType: 'CSV' },
    { headers },
  );
  await uploadAndClose(baseUrl, headers, job.id, records);
  await pollJob(baseUrl, headers, job.id, objectName);
}

async function bulkUpsert(
  baseUrl: string,
  headers: Record<string, string>,
  objectName: string,
  externalIdField: string,
  records: Record<string, unknown>[],
): Promise<void> {
  if (records.length === 0) return;
  console.log(`[scoring] Upserting ${records.length} ${objectName} records…`);
  const { data: job } = await axios.post<{ id: string }>(
    `${baseUrl}/jobs/ingest`,
    { object: objectName, operation: 'upsert', externalIdFieldName: externalIdField, contentType: 'CSV' },
    { headers },
  );
  await uploadAndClose(baseUrl, headers, job.id, records);
  await pollJob(baseUrl, headers, job.id, objectName);
}

async function uploadAndClose(
  baseUrl: string,
  headers: Record<string, string>,
  jobId: string,
  records: Record<string, unknown>[],
): Promise<void> {
  const csv = toCsv(records);
  await axios.put(
    `${baseUrl}/jobs/ingest/${jobId}/batches`,
    csv,
    { headers: { ...headers, 'Content-Type': 'text/csv' } },
  );
  await axios.patch(
    `${baseUrl}/jobs/ingest/${jobId}`,
    { state: 'UploadComplete' },
    { headers },
  );
}

async function pollJob(
  baseUrl: string,
  headers: Record<string, string>,
  jobId: string,
  objectName: string,
): Promise<void> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await sleep(POLL_INTERVAL_MS);
    const { data } = await axios.get<{
      state: string;
      numberRecordsProcessed: number;
      numberRecordsFailed: number;
    }>(`${baseUrl}/jobs/ingest/${jobId}`, { headers });

    if (data.state === 'JobComplete' || data.state === 'Failed') {
      console.log(`[scoring] ${objectName} job ${data.state} — processed: ${data.numberRecordsProcessed}, failed: ${data.numberRecordsFailed}`);
      if (data.numberRecordsFailed > 0) {
        const { data: failed } = await axios.get(
          `${baseUrl}/jobs/ingest/${jobId}/failedResults`, { headers });
        console.error(`[scoring] Failed rows:`, String(failed).slice(0, 500));
      }
      return;
    }
  }
  console.warn(`[scoring] Polling timed out for job ${jobId}`);
}

function toCsv(records: Record<string, unknown>[]): string {
  const keys = Object.keys(records[0]);
  const header = keys.join(',');
  const rows = records.map(r => keys.map(k => csvEscape(String(r[k] ?? ''))).join(','));
  return [header, ...rows].join('\n');
}

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
