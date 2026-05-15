import axios from 'axios';
import type { NormalisedSignal } from '../salesforce/types.js';
import { signalHash, companyHash } from '../utils/hash.js';
import { classifyUsHq } from '../utils/usFilter.js';
import { scoreSignal } from '../scoring/deterministic.js';

const BASE_URL = 'https://clinicaltrials.gov/api/v2/studies';
const PAGE_SIZE = 100;

// Fields we request from ClinicalTrials.gov v2 API
const FIELDS = [
  'NCTId',
  'BriefTitle',
  'OfficialTitle',
  'OverallStatus',
  'Phase',
  'LeadSponsorName',
  'LeadSponsorClass',
  'StudyFirstSubmitDate',
  'StartDate',
  'Condition',
  'BriefSummary',
  'LocationCountry',
  'LocationCity',
  'DesignPrimaryPurpose',
  'InterventionType',
  'InterventionName',
].join(',');

interface CtStudy {
  protocolSection: {
    identificationModule: {
      nctId: string;
      briefTitle: string;
      officialTitle?: string;
    };
    statusModule: {
      overallStatus: string;
      studyFirstSubmitDate?: string;
      startDateStruct?: { date: string };
    };
    sponsorCollaboratorsModule: {
      leadSponsor: {
        name: string;
        class: string;
      };
    };
    descriptionModule?: {
      briefSummary?: string;
    };
    conditionsModule?: {
      conditions?: string[];
    };
    designModule?: {
      phases?: string[];
      designInfo?: { primaryPurpose?: string };
    };
    contactsLocationsModule?: {
      locations?: Array<{
        country?: string;
        city?: string;
      }>;
    };
    armsInterventionsModule?: {
      interventions?: Array<{
        type?: string;
        name?: string;
      }>;
    };
  };
}

export async function fetchClinicalTrialsSignals(lookbackDays = 7): Promise<NormalisedSignal[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
  const cutoffStr = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD

  const results: NormalisedSignal[] = [];
  let nextPageToken: string | undefined;

  console.log(`[clinicaltrials] Fetching Phase 1 trials submitted since ${cutoffStr}…`);

  do {
    const params: Record<string, string> = {
      'filter.overallStatus': 'NOT_YET_RECRUITING,RECRUITING',
      'filter.advanced': `AREA[Phase]PHASE1 AND AREA[LeadSponsorClass]INDUSTRY AND AREA[StudyFirstSubmitDate]RANGE[${cutoffStr}, MAX]`,
      fields: FIELDS,
      pageSize: String(PAGE_SIZE),
      countTotal: 'true',
      format: 'json',
    };

    if (nextPageToken) params['pageToken'] = nextPageToken;

    const response = await axios.get<{
      studies: CtStudy[];
      nextPageToken?: string;
      totalCount?: number;
    }>(BASE_URL, { params, timeout: 30_000 });

    const { studies, nextPageToken: token } = response.data;
    nextPageToken = token;

    for (const study of studies ?? []) {
      const signal = normaliseStudy(study);
      if (signal) results.push(signal);
    }
  } while (nextPageToken);

  console.log(`[clinicaltrials] Found ${results.length} normalisable signals`);
  return results;
}

function normaliseStudy(study: CtStudy): NormalisedSignal | null {
  const proto = study.protocolSection;
  const sponsor = proto.sponsorCollaboratorsModule?.leadSponsor;

  if (!sponsor || sponsor.class !== 'INDUSTRY') return null;

  const companyName = sponsor.name.trim();
  const nctId = proto.identificationModule.nctId;
  const phases = proto.designModule?.phases ?? [];
  if (!phases.some(p => p.toUpperCase().includes('PHASE1') || p.toUpperCase().includes('PHASE 1'))) return null;

  const locations = proto.contactsLocationsModule?.locations ?? [];
  const firstLocation = locations[0];
  const usStatus = classifyUsHq(firstLocation?.country, firstLocation?.city);

  // Only pass through US and Unknown; drop confirmed NonUS
  if (usStatus === 'NonUS') return null;

  const signalDate = proto.statusModule.studyFirstSubmitDate
    ?? proto.statusModule.startDateStruct?.date
    ?? new Date().toISOString().split('T')[0];

  const sourceUrl = `https://clinicaltrials.gov/study/${nctId}`;
  const conditions = proto.conditionsModule?.conditions?.join(', ') ?? '';
  const briefTitle = proto.identificationModule.briefTitle;
  const summary = `${briefTitle}. Condition: ${conditions}. Sponsor: ${companyName}. Status: ${proto.statusModule.overallStatus}.`;

  const dedupeHash = signalHash(sourceUrl, 'Trial Registration', signalDate, companyName);

  const interventions = proto.armsInterventionsModule?.interventions ?? [];
  const modality = mapInterventionToModality(interventions);

  const signal: NormalisedSignal = {
    externalId: dedupeHash,
    companyName,
    companyExternalId: companyHash(companyName),
    isUsHq: usStatus === 'US',
    hqCountry: usStatus === 'US' ? 'United States' : 'Unknown',
    signalType: 'Trial Registration',
    signalDate,
    modality,
    therapeuticArea: mapConditionToTA(conditions),
    companyStage: 'Unknown',
    confidence: 'High',
    summary,
    phaseIReadinessWeight: 0,
    sourceUrl,
    sourcePublisher: 'ClinicalTrials.gov',
    sourceConfidenceTier: 'Tier 1-Regulatory',
    sourcePublishDate: signalDate,
    rawPayload: JSON.stringify(proto).slice(0, 32_000),
  };

  signal.phaseIReadinessWeight = scoreSignal(signal).phaseIReadinessWeight;
  return signal;
}

function mapInterventionToModality(
  interventions: Array<{ type?: string; name?: string }>,
): string {
  for (const { type = '', name = '' } of interventions) {
    const n = name.toLowerCase();
    const t = type.toUpperCase();

    // ADC: antibody-drug conjugates
    if (n.includes('adc') || n.includes('antibody drug conjugate') || n.includes('antibody-drug conjugate')) return 'ADC';

    // Biosimilar: explicit labelling or known suffix
    if (n.includes('biosimilar')) return 'Biosimilar';

    // Peptide: name suffix or keyword
    if (n.endsWith('tide') || n.includes('peptide')) return 'Peptide';

    // Oligonucleotide: antisense, siRNA, mRNA, oligonucleotide keywords
    if (
      n.includes('sirna') || n.includes('mrna') || n.includes('antisense') ||
      n.includes('oligonucleotide') || n.endsWith('sen') || n.endsWith('mir')
    ) return 'Oligonucleotide';

    // Small molecule: kinase inhibitors, common small-molecule suffixes
    if (
      t === 'DRUG' ||
      n.endsWith('inib') || n.endsWith('nib') || n.endsWith('ib') ||
      n.includes('kinase inhibitor') || n.includes('inhibitor')
    ) return 'Small molecule';

    // Biological fallback: monoclonal antibodies, fusion proteins
    if (t === 'BIOLOGICAL') {
      if (n.endsWith('mab') || n.endsWith('cept') || n.endsWith('kin')) return 'Biosimilar';
      return 'Other';
    }
  }
  return 'Unknown';
}

function mapConditionToTA(conditions: string): string {
  const c = conditions.toLowerCase();
  if (/cancer|tumor|tumour|leukemia|lymphoma|carcinoma|sarcoma|melanoma|myeloma|oncol/.test(c)) {
    return 'Oncology & Hematology';
  }
  if (/alzheimer|parkinson|depression|schizophrenia|epilepsy|neurolog|cns|brain|psychiatric/.test(c)) {
    return 'CNS';
  }
  if (/crohn|colitis|lupus|rheumatoid|autoimmune|immunolog|inflammation/.test(c)) {
    return 'Immunology';
  }
  if (/diabetes|obesity|cardiovascular|heart|metabolic|lipid|hypertension/.test(c)) {
    return 'Cardiometabolic';
  }
  return 'Other';
}
