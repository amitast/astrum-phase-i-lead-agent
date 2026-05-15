import axios from 'axios';
import type { NormalisedSignal } from '../salesforce/types.js';

const EFTS_URL = 'https://efts.sec.gov/LATEST/search-index';
const ARCHIVE_URL = 'https://www.sec.gov/Archives/edgar/data';
// EDGAR requires an identifying User-Agent header
const USER_AGENT = 'Astrum CRO Lead Agent amit.kumar@astrumcro.com';
const RATE_LIMIT_MS = 250; // EDGAR: max 10 req/s; we stay well under

// Original stub functionality kept: signal ingestion from EDGAR is not yet implemented.
// This module now also exports lookupCompanyStage() used by the enrichment pass.
export async function fetchEdgarSignals(_lookbackDays = 7): Promise<NormalisedSignal[]> {
  console.log('[edgar] Signal ingestion stub — not yet implemented');
  return [];
}

/**
 * Looks up a company in SEC EDGAR to determine its funding stage.
 * Returns one of the Company_Stage__c picklist values:
 *   'Public' | 'Series A' | 'Series B' | 'Series C' | 'Series D+' |
 *   'Seed / Pre-Series A' | 'Unknown'
 */
export async function lookupCompanyStage(companyName: string): Promise<string> {
  // 1. Public company check — presence of a recent 10-K filing
  const isPublic = await checkPublic(companyName);
  if (isPublic) return 'Public';

  await sleep(RATE_LIMIT_MS);

  // 2. Form D lookup — private capital raise
  return getFormDStage(companyName);
}

async function checkPublic(companyName: string): Promise<boolean> {
  try {
    const { data } = await axios.get(EFTS_URL, {
      params: {
        q: `"${companyName}"`,
        forms: '10-K',
        dateRange: 'custom',
        startdt: twoYearsAgo(),
      },
      timeout: 10_000,
      headers: { 'User-Agent': USER_AGENT },
    });
    const total = data?.hits?.total?.value ?? data?.total?.value ?? 0;
    return total > 0;
  } catch {
    return false;
  }
}

async function getFormDStage(companyName: string): Promise<string> {
  let hits: FormDHit[] = [];
  try {
    const { data } = await axios.get(EFTS_URL, {
      params: {
        q: `"${companyName}"`,
        forms: 'D',
        dateRange: 'custom',
        startdt: '2020-01-01',
      },
      timeout: 10_000,
      headers: { 'User-Agent': USER_AGENT },
    });
    hits = data?.hits?.hits ?? [];
  } catch {
    return 'Unknown';
  }

  if (hits.length === 0) return 'Unknown';

  // Take the most recent Form D filing (hits are sorted by relevance; sort by date)
  hits.sort((a, b) => (b._source.file_date ?? '').localeCompare(a._source.file_date ?? ''));
  const latest = hits[0]._source;

  // Attempt to fetch Form D XML and read totalAmountSold
  const amount = await fetchFormDAmount(latest);
  if (amount === null) return 'Unknown';

  return amountToStage(amount);
}

async function fetchFormDAmount(hit: FormDSource): Promise<number | null> {
  const rawCik = hit.entity_id ?? '';
  const accNo = hit.accession_no ?? '';
  if (!rawCik || !accNo) return null;

  const cik = parseInt(rawCik, 10).toString(); // strip leading zeros for archive path
  const accNoClean = accNo.replace(/-/g, '');

  await sleep(RATE_LIMIT_MS);

  try {
    const xmlUrl = `${ARCHIVE_URL}/${cik}/${accNoClean}/primary_doc.xml`;
    const { data: xml } = await axios.get<string>(xmlUrl, {
      timeout: 10_000,
      headers: { 'User-Agent': USER_AGENT },
      responseType: 'text',
    });

    // Extract totalAmountSold from Form D XML using regex (avoids XML parser dep)
    const match = xml.match(/<totalAmountSold>\s*([\d.]+)\s*<\/totalAmountSold>/i);
    if (!match) return null;
    return parseFloat(match[1]);
  } catch {
    return null;
  }
}

function amountToStage(amount: number): string {
  if (amount < 10_000_000) return 'Seed / Pre-Series A';
  if (amount < 40_000_000) return 'Series A';
  if (amount < 80_000_000) return 'Series B';
  if (amount < 200_000_000) return 'Series C';
  return 'Series D+';
}

function twoYearsAgo(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  return d.toISOString().split('T')[0];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface FormDSource {
  entity_name?: string;
  entity_id?: string;
  file_date?: string;
  form_type?: string;
  accession_no?: string;
}

interface FormDHit {
  _source: FormDSource;
}
