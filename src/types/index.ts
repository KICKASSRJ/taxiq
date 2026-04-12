/** All TypeScript types for the CAMS MF Tax Tracker */

/** A single mutual fund holding parsed from CAS */
export interface ParsedHolding {
  amcName: string;
  folioNumber: string;
  schemeName: string;
  /** AMFI scheme code if found in CAS, otherwise empty */
  amfiCode: string;
  /** Current units held as of statement date */
  units: number;
  /** NAV as of statement date (from CAS) */
  navAsOfStatement: number;
  /** Value as of statement date (from CAS) */
  valueAsOfStatement: number;
  /** PAN extracted from CAS header */
  pan: string;
}

/** Result of CAS PDF parsing */
export interface CASParseResult {
  success: boolean;
  holdings: ParsedHolding[];
  investorName: string;
  pan: string;
  email: string;
  statementDate: string;
  errors: string[];
}

/** A matched scheme from MFapi.in */
export interface SchemeMatch {
  /** The original CAS scheme name */
  casName: string;
  /** MFapi.in scheme code */
  schemeCode: number;
  /** MFapi.in scheme name */
  schemeName: string;
  /** Confidence score 0-1 */
  confidence: number;
}

/** Multiple possible matches for ambiguous schemes */
export interface SchemeMatchResult {
  holding: ParsedHolding;
  matches: SchemeMatch[];
  /** Best match (highest confidence) */
  selectedMatch: SchemeMatch | null;
  /** Whether user confirmation is needed (multiple close matches) */
  needsConfirmation: boolean;
  /** Match status */
  status: 'matched' | 'ambiguous' | 'unmatched';
}

/** A single NAV data point */
export interface NavDataPoint {
  date: string; // DD-MM-YYYY format from MFapi.in
  nav: number;
}

/** Historical NAV data for a scheme */
export interface SchemeNavHistory {
  schemeCode: number;
  schemeName: string;
  navData: NavDataPoint[];
}

/** Treasury exchange rate */
export interface TreasuryRate {
  recordDate: string;
  country: string;
  currency: string;
  exchangeRate: number;
}

/** FBAR computation result for a single fund */
export interface FbarFundResult {
  /** Original holding */
  holding: ParsedHolding;
  /** Matched scheme info */
  schemeCode: number;
  matchedSchemeName: string;
  /** Calendar year computed for */
  calendarYear: number;
  /** Peak value computation */
  peakValueINR: number;
  peakValueDate: string;
  peakNav: number;
  peakUnits: number;
  /** Year-end value computation */
  yearEndValueINR: number;
  yearEndNav: number;
  yearEndDate: string;
  yearEndUnits: number;
  /** USD conversion */
  exchangeRate: number;
  exchangeRateSource: string;
  peakValueUSD: number;
  yearEndValueUSD: number;
  /** Audit trail */
  navDataPointsUsed: number;
  navSource: string;
}

/** Complete FBAR report */
export interface FbarReport {
  investorName: string;
  pan: string;
  calendarYear: number;
  exchangeRate: number;
  exchangeRateSource: string;
  exchangeRateDate: string;
  isCustomRate: boolean;
  funds: FbarFundResult[];
  totalPeakUSD: number;
  totalYearEndUSD: number;
  computedAt: string;
  irsFormRevision: string;
  disclaimer: string;
}

/** MFapi.in scheme list item */
export interface MfApiScheme {
  schemeCode: number;
  schemeName: string;
}

/** App workflow state */
export type AppStep =
  | 'landing'
  | 'upload'
  | 'parsing'
  | 'confirm-schemes'
  | 'computing'
  | 'report'
  | 'error';
