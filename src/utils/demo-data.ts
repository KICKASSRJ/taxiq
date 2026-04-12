/**
 * Demo mode — pre-loaded sample data to demonstrate the full FBAR flow
 * without needing an actual CAS PDF.
 */
import type { ParsedHolding, SchemeMatchResult, SchemeMatch } from '../types';

/** Sample holdings that represent a realistic Indian MF portfolio */
export const DEMO_HOLDINGS: ParsedHolding[] = [
  {
    amcName: 'HDFC Mutual Fund',
    folioNumber: '1234567890',
    schemeName: 'HDFC Flexi Cap Fund - Direct Plan - Growth',
    amfiCode: '',
    units: 245.678,
    navAsOfStatement: 1850.45,
    valueAsOfStatement: 454635.12,
    pan: 'DEMO0P0000D',
  },
  {
    amcName: 'ICICI Prudential Mutual Fund',
    folioNumber: '9876543210',
    schemeName: 'ICICI Prudential Bluechip Fund - Direct Plan - Growth',
    amfiCode: '',
    units: 512.340,
    navAsOfStatement: 98.76,
    valueAsOfStatement: 50610.29,
    pan: 'DEMO0P0000D',
  },
  {
    amcName: 'SBI Mutual Fund',
    folioNumber: '5555666677',
    schemeName: 'SBI Small Cap Fund - Direct Plan - Growth',
    amfiCode: '',
    units: 180.500,
    navAsOfStatement: 165.25,
    valueAsOfStatement: 29827.63,
    pan: 'DEMO0P0000D',
  },
  {
    amcName: 'Axis Mutual Fund',
    folioNumber: '3333444455',
    schemeName: 'Axis Long Term Equity Fund - Direct Plan - Growth',
    amfiCode: '',
    units: 890.125,
    navAsOfStatement: 85.60,
    valueAsOfStatement: 76202.70,
    pan: 'DEMO0P0000D',
  },
  {
    amcName: 'Parag Parikh Mutual Fund',
    folioNumber: '7777888899',
    schemeName: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',
    amfiCode: '',
    units: 320.000,
    navAsOfStatement: 72.50,
    valueAsOfStatement: 23200.00,
    pan: 'DEMO0P0000D',
  },
];

/** Pre-mapped scheme codes for demo (these are real MFapi.in codes) */
const DEMO_MATCHES: { schemeName: string; schemeCode: number; apiName: string }[] = [
  { schemeName: 'HDFC Flexi Cap Fund - Direct Plan - Growth', schemeCode: 118989, apiName: 'HDFC Flexi Cap Fund - Direct Plan-Growth Option' },
  { schemeName: 'ICICI Prudential Bluechip Fund - Direct Plan - Growth', schemeCode: 120586, apiName: 'ICICI Prudential Bluechip Fund - Direct Plan -  Growth' },
  { schemeName: 'SBI Small Cap Fund - Direct Plan - Growth', schemeCode: 125497, apiName: 'SBI Small Cap Fund - Direct Plan - Growth' },
  { schemeName: 'Axis Long Term Equity Fund - Direct Plan - Growth', schemeCode: 120503, apiName: 'Axis Long Term Equity Fund - Direct Plan - Growth' },
  { schemeName: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth', schemeCode: 122639, apiName: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth' },
];

/** Generate pre-matched scheme results for demo mode */
export function getDemoMatchResults(): SchemeMatchResult[] {
  return DEMO_HOLDINGS.map(holding => {
    const demoMatch = DEMO_MATCHES.find(dm => dm.schemeName === holding.schemeName);
    const match: SchemeMatch = {
      casName: holding.schemeName,
      schemeCode: demoMatch?.schemeCode || 0,
      schemeName: demoMatch?.apiName || holding.schemeName,
      confidence: 0.95,
    };

    return {
      holding,
      matches: [match],
      selectedMatch: match,
      needsConfirmation: false,
      status: 'matched' as const,
    };
  });
}
