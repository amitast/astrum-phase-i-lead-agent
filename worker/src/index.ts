import cron from 'node-cron';
import { runRegulatoryPass, runPressPass, runNightlyScoringPass } from './pipeline/processor.js';

const REGULATORY_CRON = process.env.REGULATORY_CRON ?? '0 * * * *';    // hourly
const PRESS_CRON      = process.env.PRESS_CRON      ?? '0 */6 * * *';  // every 6 hours
const SCORING_CRON    = process.env.SCORING_CRON    ?? '0 2 * * *';    // 2am UTC nightly

console.log('[scheduler] Astrum Lead Agent Worker starting… (v2 — enrichment + address)');
console.log(`[scheduler] Regulatory pass schedule: ${REGULATORY_CRON}`);
console.log(`[scheduler] Press RSS pass schedule:  ${PRESS_CRON}`);
console.log(`[scheduler] Nightly scoring schedule: ${SCORING_CRON}`);

// Run ingestion + scoring once on startup, then on schedule
(async () => {
  try {
    await runRegulatoryPass();
  } catch (err) {
    console.error('[startup] Regulatory pass error:', err);
  }
  try {
    await runNightlyScoringPass();
  } catch (err) {
    console.error('[startup] Scoring pass error:', err);
  }
})();

cron.schedule(REGULATORY_CRON, async () => {
  try {
    await runRegulatoryPass();
  } catch (err) {
    console.error('[cron] Regulatory pass error:', err);
  }
});

cron.schedule(PRESS_CRON, async () => {
  try {
    await runPressPass();
  } catch (err) {
    console.error('[cron] Press pass error:', err);
  }
});

cron.schedule(SCORING_CRON, async () => {
  try {
    await runNightlyScoringPass();
  } catch (err) {
    console.error('[cron] Scoring pass error:', err);
  }
});
