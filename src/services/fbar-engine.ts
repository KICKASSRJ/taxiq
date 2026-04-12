/**
 * FBAR Computation Engine — computes peak and year-end values for
 * each mutual fund holding, converts to USD, and produces an auditable report.
 */
import type {
  ParsedHolding,
  SchemeMatchResult,
  FbarFundResult,
  FbarReport,
} from '../types';
import {
  fetchSchemeNav,
  filterNavByYear,
  findPeakNav,
  findYearEndNav,
} from './nav-service';
import { fetchTreasuryRate, convertInrToUsd } from './treasury-service';
import { traceStart, traceEnd, traceError } from '../utils/perf-trace';

const DISCLAIMER =
  'This tool provides computational assistance only. It does not constitute tax, legal, or financial advice. Verify all values before filing. Consult a qualified tax professional for filing guidance.';

/**
 * Compute FBAR values for a single fund.
 */
async function computeFundFbar(
  holding: ParsedHolding,
  schemeCode: number,
  matchedSchemeName: string,
  year: number,
  exchangeRate: number,
  exchangeRateSource: string
): Promise<FbarFundResult | null> {
  try {
    const navHistory = await fetchSchemeNav(schemeCode);
    const yearNav = filterNavByYear(navHistory.navData, year);

    if (yearNav.length === 0) {
      return null;
    }

    const peak = findPeakNav(yearNav);
    const yearEnd = findYearEndNav(yearNav, year);

    if (!peak || !yearEnd) return null;

    const peakValueINR = holding.units * peak.nav;
    const yearEndValueINR = holding.units * yearEnd.nav;

    return {
      holding,
      schemeCode,
      matchedSchemeName,
      calendarYear: year,
      peakValueINR: Math.round(peakValueINR * 100) / 100,
      peakValueDate: peak.date,
      peakNav: peak.nav,
      peakUnits: holding.units,
      yearEndValueINR: Math.round(yearEndValueINR * 100) / 100,
      yearEndNav: yearEnd.nav,
      yearEndDate: yearEnd.date,
      yearEndUnits: holding.units,
      exchangeRate,
      exchangeRateSource,
      peakValueUSD: convertInrToUsd(peakValueINR, exchangeRate),
      yearEndValueUSD: convertInrToUsd(yearEndValueINR, exchangeRate),
      navDataPointsUsed: yearNav.length,
      navSource: 'MFapi.in',
    };
  } catch (err) {
    console.error(`FBAR computation failed for ${holding.schemeName}:`, err);
    return null;
  }
}

/**
 * Generate a complete FBAR report for all confirmed scheme matches.
 */
export async function generateFbarReport(
  matchResults: SchemeMatchResult[],
  investorName: string,
  pan: string,
  year: number,
  customExchangeRate?: number,
  onProgress?: (done: number, total: number) => void
): Promise<FbarReport> {
  // Fetch Treasury rate
  const tTreasury = traceStart('Fetch Treasury rate', 'treasury');
  let exchangeRate: number;
  let exchangeRateSource: string;
  let exchangeRateDate: string;
  let isCustomRate = false;

  if (customExchangeRate && customExchangeRate > 0) {
    exchangeRate = customExchangeRate;
    exchangeRateSource = 'User-provided custom rate';
    exchangeRateDate = 'N/A';
    isCustomRate = true;
  } else {
    const tRate = await fetchTreasuryRate(year);
    if (tRate) {
      exchangeRate = tRate.exchangeRate;
      exchangeRateSource = `US Treasury Reporting Rate (${tRate.recordDate})`;
      exchangeRateDate = tRate.recordDate;
    } else {
      throw new Error(
        `Unable to fetch Treasury exchange rate for ${year}. Please enter a custom rate.`
      );
    }
  }
  traceEnd(tTreasury, `1 USD = ₹${exchangeRate}`);

  // Compute FBAR values for each matched fund — parallel with concurrency limit
  console.time('[PERF] All NAV fetches');
  const confirmedMatches = matchResults.filter(
    m => m.status !== 'unmatched' && m.selectedMatch
  );

  const CONCURRENCY = 14;
  const funds: FbarFundResult[] = [];
  let done = 0;

  for (let i = 0; i < confirmedMatches.length; i += CONCURRENCY) {
    const batch = confirmedMatches.slice(i, i + CONCURRENCY);
    const batchTraces = batch.map(m =>
      traceStart(`NAV: ${m.selectedMatch!.schemeName.slice(0, 40)}`, 'nav-fetch', `code=${m.selectedMatch!.schemeCode}`)
    );
    const batchResults = await Promise.all(
      batch.map((match, idx) =>
        computeFundFbar(
          match.holding,
          match.selectedMatch!.schemeCode,
          match.selectedMatch!.schemeName,
          year,
          exchangeRate,
          exchangeRateSource
        ).then(r => {
          traceEnd(batchTraces[idx], r ? `${r.navDataPointsUsed} NAV pts` : 'no data');
          return r;
        }).catch(err => {
          traceError(batchTraces[idx], err?.message || 'failed');
          return null;
        })
      )
    );

    for (const result of batchResults) {
      if (result) funds.push(result);
      done++;
      onProgress?.(done, confirmedMatches.length);
    }
  }
  console.timeEnd('[PERF] All NAV fetches');
  console.log(`[PERF] Computed ${funds.length}/${confirmedMatches.length} funds`);

  const totalPeakUSD = funds.reduce((sum, f) => sum + f.peakValueUSD, 0);
  const totalYearEndUSD = funds.reduce((sum, f) => sum + f.yearEndValueUSD, 0);

  return {
    investorName,
    pan,
    calendarYear: year,
    exchangeRate,
    exchangeRateSource,
    exchangeRateDate,
    isCustomRate,
    funds,
    totalPeakUSD: Math.round(totalPeakUSD * 100) / 100,
    totalYearEndUSD: Math.round(totalYearEndUSD * 100) / 100,
    computedAt: new Date().toISOString(),
    irsFormRevision: 'FinCEN 114, Rev. 2025',
    disclaimer: DISCLAIMER,
  };
}
