// Canonical US filter: a company is "US" if ANY of the conditions below is met.
// Ambiguous cases return 'Unknown' — never silently drop.

export type UsStatus = 'US' | 'NonUS' | 'Unknown';

const US_STATES = new Set([
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut',
  'delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa',
  'kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan',
  'minnesota','mississippi','missouri','montana','nebraska','nevada',
  'new hampshire','new jersey','new mexico','new york','north carolina',
  'north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island',
  'south carolina','south dakota','tennessee','texas','utah','vermont',
  'virginia','washington','west virginia','wisconsin','wyoming',
  'district of columbia','puerto rico',
]);

const US_COUNTRY_STRINGS = new Set(['united states', 'usa', 'us', 'u.s.', 'u.s.a.']);

export function classifyUsHq(sponsorCountry: string | null | undefined, sponsorCity: string | null | undefined): UsStatus {
  if (sponsorCountry) {
    const c = sponsorCountry.toLowerCase().trim();
    if (US_COUNTRY_STRINGS.has(c)) return 'US';
    // If country is explicitly non-US, return NonUS
    if (c && c !== 'unknown' && c !== '') return 'NonUS';
  }

  if (sponsorCity) {
    const city = sponsorCity.toLowerCase();
    for (const state of US_STATES) {
      if (city.includes(state)) return 'US';
    }
  }

  return 'Unknown';
}

export type Region = 'US' | 'UK' | 'EU' | 'Other' | 'Unknown';

const UK_STRINGS = new Set([
  'united kingdom', 'uk', 'gb', 'great britain',
  'england', 'scotland', 'wales', 'northern ireland',
]);

// EU member states + key EEA/Swiss biotech hubs (not all EU, but major ones)
const EU_STRINGS = new Set([
  'germany', 'france', 'switzerland', 'netherlands', 'belgium', 'spain',
  'italy', 'sweden', 'denmark', 'finland', 'austria', 'ireland', 'norway',
  'luxembourg', 'portugal', 'czech republic', 'czechia', 'poland', 'hungary',
  'greece', 'croatia', 'slovakia', 'slovenia', 'estonia', 'latvia', 'lithuania',
  'romania', 'bulgaria', 'malta', 'cyprus', 'iceland',
]);

export function classifyRegion(
  sponsorCountry: string | null | undefined,
  sponsorCity: string | null | undefined,
): Region {
  if (sponsorCountry) {
    const c = sponsorCountry.toLowerCase().trim();
    if (US_COUNTRY_STRINGS.has(c)) return 'US';
    if (UK_STRINGS.has(c)) return 'UK';
    if (EU_STRINGS.has(c)) return 'EU';
    if (c && c !== 'unknown' && c !== '') return 'Other';
  }

  if (sponsorCity) {
    const city = sponsorCity.toLowerCase();
    for (const state of US_STATES) {
      if (city.includes(state)) return 'US';
    }
  }

  return 'Unknown';
}
