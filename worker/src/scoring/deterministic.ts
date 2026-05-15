import type { NormalisedSignal } from '../salesforce/types.js';

// Signal type → Phase I Readiness weight (0–1 scale stored as Number 5,2)
const PHASE_I_READINESS_WEIGHT: Record<string, number> = {
  'IND/IMPD Filing':      1.00,
  'Trial Registration':   0.90,
  'Funding Round':        0.60,
  'Key Hire':             0.55,
  'Positive Preclinical': 0.50,
  'Partnership/Licensing':0.40,
  'Regulatory Filing-Other': 0.35,
  'Press Release-Other':  0.20,
  'Other':                0.10,
};

// Modality → Astrum score (100 = priority match, 50 = unknown, 0 = no match)
const MODALITY_SCORE: Record<string, number> = {
  'Small molecule': 100,
  'ADC':            100,
  'Peptide':        100,
  'Oligonucleotide':100,
  'Biosimilar':     100,
  'Unknown':         50,
  'Other':            0,
};

// TA → Astrum score
const TA_SCORE: Record<string, number> = {
  'Oncology & Hematology': 100,
  'CNS':                   100,
  'Immunology':            100,
  'Cardiometabolic':       100,
  'Unknown':                50,
  'Other':                   0,
};

// Company stage → Astrum score
const STAGE_SCORE: Record<string, number> = {
  'Series A':       100,
  'Series B':       100,
  'Series C':       100,
  'Seed/Pre-Series A': 50,
  'Series D+':       50,
  'Public':          50,
  'Unknown':          0,
};

// Source confidence tier → score
const SOURCE_CONFIDENCE_SCORE: Record<string, number> = {
  'Tier 1-Regulatory':   100,
  'Tier 2-Trade Press':   75,
  'Tier 3-Aggregator':    50,
};

export interface ScoreResult {
  phaseIReadinessWeight: number;
  astrumFitScore: number;
  timingScore: number;
  sourceConfidenceScore: number;
  overallPriorityScore: number;
  priorityBand: 'Hot' | 'Warm' | 'Watch' | 'Cold';
}

export function scoreSignal(signal: NormalisedSignal): ScoreResult {
  const phaseIReadinessWeight = PHASE_I_READINESS_WEIGHT[signal.signalType] ?? 0.10;

  const modalityScore = MODALITY_SCORE[signal.modality] ?? 0;
  const taScore = TA_SCORE[signal.therapeuticArea] ?? 0;
  const stageScore = STAGE_SCORE[signal.companyStage] ?? 0;
  const astrumFitScore = (modalityScore * 0.40) + (taScore * 0.40) + (stageScore * 0.20);

  const timingScore = computeTimingScore(signal.signalDate);
  const sourceConfidenceScore = SOURCE_CONFIDENCE_SCORE[signal.sourceConfidenceTier] ?? 50;

  // Phase I Readiness score: weight × 100 to give 0–100 range
  const phaseIReadinessScore = phaseIReadinessWeight * 100;

  const overallPriorityScore =
    (phaseIReadinessScore * 0.40) +
    (astrumFitScore      * 0.25) +
    (timingScore         * 0.20) +
    (sourceConfidenceScore * 0.15);

  const priorityBand = bandFromScore(overallPriorityScore);

  return {
    phaseIReadinessWeight,
    astrumFitScore,
    timingScore,
    sourceConfidenceScore,
    overallPriorityScore,
    priorityBand,
  };
}

function computeTimingScore(signalDateStr: string): number {
  const signalDate = new Date(signalDateStr);
  const now = new Date();
  const ageDays = Math.floor((now.getTime() - signalDate.getTime()) / (1000 * 60 * 60 * 24));

  if (ageDays <= 30)  return 100;
  if (ageDays <= 90)  return 75;
  if (ageDays <= 180) return 50;
  if (ageDays <= 365) return 25;
  return 0;
}

function bandFromScore(score: number): 'Hot' | 'Warm' | 'Watch' | 'Cold' {
  if (score >= 75) return 'Hot';
  if (score >= 55) return 'Warm';
  if (score >= 35) return 'Watch';
  return 'Cold';
}
