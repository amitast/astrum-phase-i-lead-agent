import axios from 'axios';
import type { NormalisedSignal } from '../salesforce/types.js';

const EFTS_URL = 'https://efts.sec.gov/LATEST/search-index';
const SUBMISSIONS_URL = 'https://data.sec.gov/submissions';
const ARCHIVE_URL = 'https://www.sec.gov/Archives/edgar/data';
const USER_AGENT = 'Astrum CRO Lead Agent amit.kumar@astrumcro.com';
const RATE_LIMIT_MS = 250; // EDGAR: max 10 req/s; we stay well under

// 2-letter US state + territory abbreviations used by SEC EDGAR
const US_STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC','PR','GU','VI','AS','MP',
]);

export interface CompanyProfile {
  stage: string;
  billingStreet?: string;
  billingCity?: string;
  billingState?: string;
  billingPostalCode?: string;
  billingCountry?: string;
}

// Signal ingestion from EDGAR is not yet implemented.
export async function fetchEdgarSignals(_lookbackDays = 7): Promise<NormalisedSignal[]> {
  console.log('[edgar] Signal ingestion stub — not yet implemented');
  return [];
}

/**
 * Returns Company_Stage__c picklist value. Thin wrapper over lookupCompanyProfile().
 */
export async function lookupCompanyStage(companyName: string): Promise<string> {
  const profile = await lookupCompanyProfile(companyName);
  return profile.stage;
}

/**
 * Looks up a company in SEC EDGAR and returns its funding stage + registered
 * business address. Makes 2–3 API calls (EFTS search → submissions JSON →
 * optionally Form D XML). Rate-limited to EDGAR's 10 req/s policy.
 */
export async function lookupCompanyProfile(companyName: string): Promise<CompanyProfile> {
  // Step 1: find CIK via EFTS (search across 10-K and Form D filings)
  const cik = await findCik(companyName);
  if (!cik) return { stage: 'Unknown' };

  await sleep(RATE_LIMIT_MS);

  // Step 2: fetch submissions JSON — gives address + full filing history
  return fetchSubmissionsProfile(cik);
}

async function findCik(companyName: string): Promise<string | null> {
  try {
    const { data } = await axios.get(EFTS_URL, {
      params: {
        q: `"${companyName}"`,
        forms: '10-K,D',
        dateRange: 'custom',
        startdt: '2020-01-01',
      },
      timeout: 10_000,
      headers: { 'User-Agent': USER_AGENT },
    });
    const hits: Array<{ _source: { entity_id?: string; file_date?: string } }> =
      data?.hits?.hits ?? [];
    if (hits.length === 0) {
      console.log(`[edgar] No EFTS hits for "${companyName}" — trying unquoted search`);
      return findCikUnquoted(companyName);
    }
    hits.sort((a, b) =>
      (b._source.file_date ?? '').localeCompare(a._source.file_date ?? ''),
    );
    const cik = hits[0]._source.entity_id ?? null;
    console.log(`[edgar] Found CIK ${cik} for "${companyName}" (${hits.length} hits)`);
    return cik;
  } catch (err) {
    console.warn(`[edgar] EFTS lookup error for "${companyName}":`, (err as Error).message);
    return null;
  }
}

async function findCikUnquoted(companyName: string): Promise<string | null> {
  try {
    const { data } = await axios.get(EFTS_URL, {
      params: {
        q: companyName,
        forms: '10-K',
        dateRange: 'custom',
        startdt: '2020-01-01',
      },
      timeout: 10_000,
      headers: { 'User-Agent': USER_AGENT },
    });
    const hits: Array<{ _source: { entity_id?: string; file_date?: string; display_names?: string } }> =
      data?.hits?.hits ?? [];
    if (hits.length === 0) {
      console.log(`[edgar] No hits for "${companyName}" (unquoted either) — skipping`);
      return null;
    }
    hits.sort((a, b) =>
      (b._source.file_date ?? '').localeCompare(a._source.file_date ?? ''),
    );
    const cik = hits[0]._source.entity_id ?? null;
    console.log(`[edgar] Unquoted CIK ${cik} for "${companyName}" — filer: ${hits[0]._source.display_names ?? '?'}`);
    return cik;
  } catch (err) {
    console.warn(`[edgar] Unquoted EFTS lookup error for "${companyName}":`, (err as Error).message);
    return null;
  }
}

async function fetchSubmissionsProfile(rawCik: string): Promise<CompanyProfile> {
  const paddedCik = rawCik.padStart(10, '0');
  try {
    const { data } = await axios.get<SubmissionsJson>(
      `${SUBMISSIONS_URL}/CIK${paddedCik}.json`,
      { timeout: 10_000, headers: { 'User-Agent': USER_AGENT } },
    );

    // --- Address ---
    const addr = data.addresses?.business ?? data.addresses?.mailing;
    const profile: CompanyProfile = { stage: 'Unknown', ...parseAddress(addr) };

    // --- Stage from filing history ---
    const forms: string[] = data.filings?.recent?.form ?? [];
    if (forms.includes('10-K')) {
      profile.stage = 'Public';
      return profile;
    }

    // Private company — look up most recent Form D for funding amount
    const dIndex = forms.indexOf('D');
    if (dIndex !== -1) {
      const accNos: string[] = data.filings?.recent?.accessionNumber ?? [];
      const accNo = accNos[dIndex];
      if (accNo) {
        await sleep(RATE_LIMIT_MS);
        const cikForPath = parseInt(rawCik, 10).toString();
        const amount = await fetchFormDAmount(cikForPath, accNo);
        if (amount !== null) profile.stage = amountToStage(amount);
      }
    }

    return profile;
  } catch {
    return { stage: 'Unknown' };
  }
}

function parseAddress(addr: SubmissionsAddress | undefined): Partial<CompanyProfile> {
  if (!addr) return {};
  const isUs = US_STATE_CODES.has(addr.stateOrCountry ?? '');
  const streetParts = [addr.street1, addr.street2].filter(Boolean);
  return {
    billingStreet: streetParts.length ? streetParts.join(', ') : undefined,
    billingCity: addr.city || undefined,
    billingState: isUs ? (addr.stateOrCountryDescription || addr.stateOrCountry) : undefined,
    billingPostalCode: addr.zipCode || undefined,
    billingCountry: isUs
      ? 'United States'
      : (addr.stateOrCountryDescription || addr.stateOrCountry || undefined),
  };
}

async function fetchFormDAmount(cik: string, accNo: string): Promise<number | null> {
  try {
    const accNoClean = accNo.replace(/-/g, '');
    const xmlUrl = `${ARCHIVE_URL}/${cik}/${accNoClean}/primary_doc.xml`;
    const { data: xml } = await axios.get<string>(xmlUrl, {
      timeout: 10_000,
      headers: { 'User-Agent': USER_AGENT },
      responseType: 'text',
    });
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface SubmissionsAddress {
  street1?: string;
  street2?: string;
  city?: string;
  stateOrCountry?: string;
  stateOrCountryDescription?: string;
  zipCode?: string;
}

interface SubmissionsJson {
  cik?: string;
  name?: string;
  addresses?: {
    business?: SubmissionsAddress;
    mailing?: SubmissionsAddress;
  };
  filings?: {
    recent?: {
      form: string[];
      accessionNumber: string[];
      filingDate: string[];
    };
  };
}
