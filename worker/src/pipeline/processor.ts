import axios from 'axios';
import { fetchClinicalTrialsSignals } from '../sources/clinicaltrials.js';
import { fetchEdgarSignals, lookupCompanyStage } from '../sources/edgar.js';
import { fetchGlobeNewswireSignals } from '../sources/globenewswire.js';
import { upsertSignals } from '../salesforce/bulkApi.js';
import { getSalesforceAuth } from '../salesforce/auth.js';
import { runScoringPass } from '../scoring/scoreWriter.js';
import type { NormalisedSignal } from '../salesforce/types.js';

const API_VERSION = '61.0';

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
  await runEnrichmentPass();
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

  // Query accounts needing stage enrichment
  const soql = `SELECT Id, Name FROM Account WHERE RecordType.Name = 'Astrum Target Biotech' AND Company_Stage__c = 'Unknown' LIMIT 200`;
  const { data } = await axios.get<{ records: Array<{ Id: string; Name: string }> }>(
    `${baseUrl}/query`,
    { headers, params: { q: soql } },
  );

  const accounts = data.records ?? [];
  if (accounts.length === 0) {
    console.log('[processor] Enrichment pass: no accounts need stage enrichment');
    return;
  }

  console.log(`[processor] Enriching ${accounts.length} accounts via EDGAR…`);
  let updated = 0;

  for (const account of accounts) {
    try {
      const stage = await lookupCompanyStage(account.Name);
      if (stage !== 'Unknown') {
        await axios.patch(
          `${baseUrl}/sobjects/Account/${account.Id}`,
          { Company_Stage__c: stage },
          { headers },
        );
        console.log(`[processor] ${account.Name} → ${stage}`);
        updated++;
      }
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
