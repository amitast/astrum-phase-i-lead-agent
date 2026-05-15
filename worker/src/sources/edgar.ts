// Phase 3 stub — SEC EDGAR ingestion not yet implemented.
// Will fetch S-1, 8-K, and prospectus filings mentioning Phase I clinical development.
import type { NormalisedSignal } from '../salesforce/types.js';

export async function fetchEdgarSignals(_lookbackDays = 7): Promise<NormalisedSignal[]> {
  console.log('[edgar] Stub — not yet implemented (Phase 3)');
  return [];
}
