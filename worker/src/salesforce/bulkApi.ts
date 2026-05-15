import { createHash } from 'crypto';
import axios from 'axios';
import { getSalesforceAuth } from './auth.js';
import type { NormalisedSignal } from './types.js';

function urlHash(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

const API_VERSION = '61.0';
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 40;

const ACCOUNT_RECORD_TYPE_ID = process.env.SF_ACCOUNT_RECORD_TYPE_ID ?? '';

export async function upsertSignals(signals: NormalisedSignal[]): Promise<void> {
  if (signals.length === 0) return;

  const { accessToken, instanceUrl } = await getSalesforceAuth();
  const baseUrl = `${instanceUrl}/services/data/v${API_VERSION}`;
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  // 1. Upsert Accounts
  await bulkUpsert(baseUrl, headers, 'Account', 'Lead_Agent_External_Id__c', signals.map(s => ({
    Lead_Agent_External_Id__c: s.companyExternalId,
    Name: s.companyName,
    RecordTypeId: ACCOUNT_RECORD_TYPE_ID,
    Is_US_HQ__c: s.isUsHq,
    HQ_Country__c: s.hqCountry,
    Lead_Agent_Status__c: 'Active',
    Lead_Agent_TA__c: s.therapeuticArea,
    Modality__c: s.modality,
    Company_Stage__c: s.companyStage,
  })));

  // 2. Upsert Sources (dedup on Source_Ext_Id__c, a SHA-256 hash of URL__c)
  const now = new Date().toISOString();
  await bulkUpsert(baseUrl, headers, 'Source__c', 'Source_Ext_Id__c', signals.map(s => ({
    Source_Ext_Id__c: urlHash(s.sourceUrl),
    URL__c: s.sourceUrl,
    Publisher__c: s.sourcePublisher,
    Confidence_Tier__c: s.sourceConfidenceTier,
    Publish_Date__c: s.sourcePublishDate ? `${s.sourcePublishDate}T00:00:00.000Z` : null,
    Fetch_Date__c: now,
    Raw_Payload__c: s.rawPayload.slice(0, 32_000),
    Verification_Status__c: 'Unverified',
  })));

  // 3. Resolve IDs then upsert Signals
  const accountIds = await resolveIds(baseUrl, headers, 'Account', 'Lead_Agent_External_Id__c',
    [...new Set(signals.map(s => s.companyExternalId))]);
  // Map URL→hash, query by hash, convert back to URL-keyed map for signal linking
  const uniqueUrls = [...new Set(signals.map(s => s.sourceUrl))];
  const hashToUrl = new Map(uniqueUrls.map(u => [urlHash(u), u]));
  const sourceIdsByHash = await resolveIds(baseUrl, headers, 'Source__c', 'Source_Ext_Id__c',
    [...hashToUrl.keys()]);
  const sourceIds = new Map([...sourceIdsByHash.entries()].map(([hash, id]) => [hashToUrl.get(hash)!, id]));

  const signalRows = signals.flatMap(s => {
    const accountId = accountIds.get(s.companyExternalId);
    const sourceId = sourceIds.get(s.sourceUrl);
    if (!accountId || !sourceId) {
      console.warn(`[bulkApi] Skipping signal ${s.externalId}: unresolved Account or Source`);
      return [];
    }
    return [{
      Target_Company__c: accountId,
      Source__c: sourceId,
      Signal_Type__c: s.signalType,
      Signal_Date__c: s.signalDate,
      Status__c: 'New',
      Modality__c: s.modality,
      Therapeutic_Area__c: s.therapeuticArea,
      Company_Stage__c: s.companyStage,
      Confidence__c: s.confidence,
      Classification_Source__c: 'Worker-Deterministic',
      Signal_Summary__c: s.summary.slice(0, 32_000),
      Dedupe_Hash__c: s.externalId,
      Phase_I_Readiness_Weight__c: s.phaseIReadinessWeight,
    }];
  });

  if (signalRows.length > 0) {
    await bulkUpsert(baseUrl, headers, 'Signal__c', 'Dedupe_Hash__c', signalRows);
  }
}

async function bulkUpsert(
  baseUrl: string,
  headers: Record<string, string>,
  objectName: string,
  externalIdField: string,
  records: Record<string, unknown>[],
): Promise<void> {
  if (records.length === 0) return;
  console.log(`[bulkApi] Upserting ${records.length} ${objectName} records…`);

  // Create job
  const { data: job } = await axios.post<{ id: string }>(
    `${baseUrl}/jobs/ingest`,
    { object: objectName, operation: 'upsert', externalIdFieldName: externalIdField, contentType: 'CSV' },
    { headers },
  );

  // Upload CSV
  const csv = toCsv(records);
  await axios.put(
    `${baseUrl}/jobs/ingest/${job.id}/batches`,
    csv,
    { headers: { ...headers, 'Content-Type': 'text/csv' } },
  );

  // Close job
  await axios.patch(
    `${baseUrl}/jobs/ingest/${job.id}`,
    { state: 'UploadComplete' },
    { headers },
  );

  // Poll for completion
  await pollJob(baseUrl, headers, job.id, objectName);
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
      console.log(`[bulkApi] ${objectName} job ${data.state} — processed: ${data.numberRecordsProcessed}, failed: ${data.numberRecordsFailed}`);
      if (data.numberRecordsFailed > 0) {
        const { data: failed } = await axios.get(`${baseUrl}/jobs/ingest/${jobId}/failedResults`, { headers });
        console.error(`[bulkApi] Failed rows sample:`, String(failed).slice(0, 500));
      }
      return;
    }
  }
  console.warn(`[bulkApi] Polling timed out for job ${jobId}`);
}

async function resolveIds(
  baseUrl: string,
  headers: Record<string, string>,
  objectName: string,
  externalIdField: string,
  values: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const chunk of chunkArray(values, 200)) {
    const quoted = chunk.map(v => `'${v.replace(/'/g, "\\'")}'`).join(',');
    const soql = `SELECT Id,${externalIdField} FROM ${objectName} WHERE ${externalIdField} IN (${quoted})`;
    const { data } = await axios.get<{ records: Record<string, string>[] }>(
      `${baseUrl}/query`,
      { headers, params: { q: soql } },
    );
    for (const rec of data.records) {
      result.set(rec[externalIdField], rec['Id']);
    }
  }
  return result;
}

function toCsv(records: Record<string, unknown>[]): string {
  if (records.length === 0) return '';
  const keys = Object.keys(records[0]);
  const header = keys.map(csvEscape).join(',');
  const rows = records.map(r => keys.map(k => csvEscape(String(r[k] ?? ''))).join(','));
  return [header, ...rows].join('\n');
}

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
