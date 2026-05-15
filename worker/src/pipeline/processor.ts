import { fetchClinicalTrialsSignals } from '../sources/clinicaltrials.js';
import { fetchEdgarSignals } from '../sources/edgar.js';
import { fetchGlobeNewswireSignals } from '../sources/globenewswire.js';
import { upsertSignals } from '../salesforce/bulkApi.js';
import { runScoringPass } from '../scoring/scoreWriter.js';
import type { NormalisedSignal } from '../salesforce/types.js';

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
