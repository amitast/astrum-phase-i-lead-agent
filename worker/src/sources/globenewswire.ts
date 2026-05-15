// Phase 3 stub — GlobeNewswire RSS ingestion not yet implemented.
// Will parse RSS feed for press releases mentioning Phase I, IND filing, funding rounds.
import type { NormalisedSignal } from '../salesforce/types.js';

export async function fetchGlobeNewswireSignals(_lookbackDays = 1): Promise<NormalisedSignal[]> {
  console.log('[globenewswire] Stub — not yet implemented (Phase 3)');
  return [];
}
