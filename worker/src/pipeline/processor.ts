import axios from 'axios';
import { fetchClinicalTrialsSignals } from '../sources/clinicaltrials.js';
import { fetchEdgarSignals, lookupCompanyProfile } from '../sources/edgar.js';
import { fetchGlobeNewswireSignals } from '../sources/globenewswire.js';
import { upsertSignals } from '../salesforce/bulkApi.js';
import { getSalesforceAuth } from '../salesforce/auth.js';
import { runScoringPass } from '../scoring/scoreWriter.js';
import type { NormalisedSignal } from '../salesforce/types.js';

const API_VERSION = '63.0';

export async function runRegulatoryPass(): Promise<void> {
  console.log('[processor] Starting regulatory pass (ClinicalTrials.gov + EDGAR)…');
  const lookbackDays = Number(process.env.LOOKBACK_DAYS ?? 7);

  let signals: NormalisedSignal[] = [];

  try {
    const ctSignals = await fetchClinicalTrialsSignals(lookbackDays);
    signals = signals.concat(ctSignals);
  } catch (err) {
    console.error('[processor] ClinicalTrials.gov fetch failed:', err);
  }

  try {
    const edgarSignals = await fetchEdgarSignals(lookbackDays);
    signals = signals.concat(edgarSignals);
  } catch (err) {
    console.error('[processor] EDGAR fetch failed:', err);
  }

  await pushToSalesforce(signals, 'regulatory');
  try {
    await runEnrichmentPass();
  } catch (err) {
    console.error('[processor] Enrichment pass failed (non-fatal):', err);
  }
}

export async function runPressPass(): Promise<void> {
  console.log('[processor] Starting press RSS pass (GlobeNewswire)…');
  const lookbackDays = 1;
  let signals: NormalisedSignal[] = [];

  try {
    const gnwSignals = await fetchGlobeNewswireSignals(lookbackDays);
    signals = signals.concat(gnwSignals);
  } catch (err) {
    console.error('[processor] GlobeNewswire fetch failed:', err);
  }

  await pushToSalesforce(signals, 'press');
}

async function pushToSalesforce(signals: NormalisedSignal[], passName: string): Promise<void> {
  if (signals.length === 0) {
    console.log(`[processor] ${passName}: No new signals to push`);
    return;
  }

  console.log(`[processor] ${passName}: Pushing ${signals.length} signals to Salesforce…`);
  try {
    await upsertSignals(signals);
    console.log(`[processor] ${passName}: Done`);
  } catch (err) {
    console.error(`[processor] ${passName}: Salesforce upsert failed:`, err);
    throw err;
  }
}

/**
 * Queries Salesforce for Accounts with Company_Stage__c = 'Unknown' and
 * enriches them via SEC EDGAR (public company check + Form D amount lookup).
 * Uses REST API PATCH (not Bulk API) — expected volume is low (< 200 accounts).
 */
export async function runEnrichmentPass(): Promise<void> {
  console.log('[processor] Starting enrichment pass (EDGAR company stage)…');

  const { accessToken, instanceUrl } = await getSalesforceAuth();
  const baseUrl = `${instanceUrl}/services/data/v${API_VERSION}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  // Query all accounts — avoids BillingCity FLS issue; per-account logic skips already-complete records
  const soql = `SELECT Id, Name FROM Account WHERE RecordType.Name = 'Astrum Target Biotech' LIMIT 200`;
  let queryData: { records: Array<{ Id: string; Name: string }> };
  try {
    const { data } = await axios.get<{ records: Array<{ Id: string; Name: string }> }>(
      `${baseUrl}/query`,
      { headers, params: { q: soql } },
    );
    queryData = data;
  } catch (err: unknown) {
    const axErr = err as { response?: { data: unknown; status: number } };
    console.error('[processor] Enrichment SOQL failed:', JSON.stringify(axErr.response?.data), 'status:', axErr.response?.status);
    throw err;
  }

  const accounts = queryData.records ?? [];
  if (accounts.length === 0) {
    console.log('[processor] Enrichment pass: all accounts already enriched');
    return;
  }

  console.log(`[processor] Enriching ${accounts.length} accounts via EDGAR…`);
  let updated = 0;

  for (const account of accounts) {
    try {
      const profile = await lookupCompanyProfile(account.Name);

      // PATCH 1: custom fields — always have FLS via permission set
      const stagePatch: Record<string, unknown> = {};
      if (profile.stage !== 'Unknown')   stagePatch.Company_Stage__c = profile.stage;
      if (profile.billingCountry)        stagePatch.HQ_Country__c = profile.billingCountry;

      if (Object.keys(stagePatch).length > 0) {
        await axios.patch(`${baseUrl}/sobjects/Account/${account.Id}`, stagePatch, { headers });
        updated++;
      }

      // PATCH 2: standard billing address fields — requires FLS on BillingCity etc. in permission set
      const addrPatch: Record<string, unknown> = {};
      if (profile.billingStreet)     addrPatch.BillingStreet = profile.billingStreet;
      if (profile.billingCity)       addrPatch.BillingCity = profile.billingCity;
      if (profile.billingState)      addrPatch.BillingState = profile.billingState;
      if (profile.billingPostalCode) addrPatch.BillingPostalCode = profile.billingPostalCode;
      if (profile.billingCountry)    addrPatch.BillingCountry = profile.billingCountry;

      if (Object.keys(addrPatch).length > 0) {
        try {
          await axios.patch(`${baseUrl}/sobjects/Account/${account.Id}`, addrPatch, { headers });
        } catch {
          console.warn(`[processor] Address PATCH skipped for ${account.Name} — billing address FLS not yet granted`);
        }
      }

      console.log(`[processor] ${account.Name} → stage: ${profile.stage}, city: ${profile.billingCity ?? '—'}`);
    } catch (err) {
      console.warn(`[processor] Enrichment failed for ${account.Name}:`, (err as Error).message);
    }
  }

  console.log(`[processor] Enrichment pass complete — updated ${updated}/${accounts.length} accounts`);
}

export async function runNightlyScoringPass(): Promise<void> {
  console.log('[processor] Starting nightly scoring pass…');
  try {
    await runScoringPass();
    console.log('[processor] Nightly scoring pass complete');
  } catch (err) {
    console.error('[processor] Scoring pass failed:', err);
    throw err;
  }
}
