import { createHash } from 'crypto';

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 64);
}

export function signalHash(sourceUrl: string, signalType: string, signalDate: string, companyName: string): string {
  return sha256(`${sourceUrl}|${signalType}|${signalDate}|${companyName.toLowerCase().trim()}`);
}

export function companyHash(companyName: string): string {
  return sha256(companyName.toLowerCase().trim());
}
