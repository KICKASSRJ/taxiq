/**
 * NAV Verification Service — cross-checks MFapi.in data against
 * AMFI India's official NAVAll.txt for data integrity.
 * 
 * Also provides direct AMFI links for manual historical NAV verification.
 */
import type { FbarFundResult } from '../types';

const AMFI_NAV_URL = '/proxy/amfi/spages/NAVAll.txt';

export interface VerificationResult {
  schemeName: string;
  schemeCode: number;
  /** Latest NAV from AMFI NAVAll.txt (official) */
  amfiNav: number | null;
  amfiDate: string | null;
  /** Latest NAV from MFapi.in */
  mfapiNav: number | null;
  mfapiDate: string | null;
  /** Whether the two sources match (within tolerance) */
  match: boolean;
  /** AMFI website link for manual historical NAV lookup */
  amfiHistoryUrl: string;
  /** The peak/year-end values used in the FBAR report */
  peakNav: number;
  peakDate: string;
  yearEndNav: number;
  yearEndDate: string;
}

/**
 * Parse latest NAV for specific scheme codes from AMFI NAVAll.txt.
 * Format: SchemeCode;ISIN_Growth;ISIN_Div;SchemeName;NAV;Date;...
 */
async function fetchAmfiLatestNavs(schemeCodes: number[]): Promise<Map<number, { nav: number; date: string }>> {
  const result = new Map<number, { nav: number; date: string }>();
  try {
    const res = await fetch(AMFI_NAV_URL);
    if (!res.ok) return result;
    const text = await res.text();

    const codeSet = new Set(schemeCodes);
    for (const line of text.split('\n')) {
      const parts = line.split(';');
      if (parts.length >= 6 && /^\d+$/.test(parts[0].trim())) {
        const code = parseInt(parts[0].trim());
        if (codeSet.has(code)) {
          const nav = parseFloat(parts[4]?.trim());
          const date = parts[5]?.trim() || '';
          if (!isNaN(nav) && nav > 0) {
            result.set(code, { nav, date });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Verify] AMFI NAVAll.txt fetch failed:', err);
  }
  return result;
}

/**
 * Fetch the latest NAV from MFapi.in for a scheme.
 */
async function fetchMfapiLatestNav(schemeCode: number): Promise<{ nav: number; date: string } | null> {
  try {
    const res = await fetch(`/proxy/mfapi/mf/${schemeCode}/latest`);
    if (!res.ok) {
      // Fallback: fetch full history and take the first (latest) entry
      const resFull = await fetch(`/proxy/mfapi/mf/${schemeCode}`);
      if (!resFull.ok) return null;
      const data = await resFull.json();
      if (data.data && data.data.length > 0) {
        return { nav: parseFloat(data.data[0].nav), date: data.data[0].date };
      }
      return null;
    }
    const data = await res.json();
    if (data.data && data.data.length > 0) {
      return { nav: parseFloat(data.data[0].nav), date: data.data[0].date };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build AMFI historical NAV lookup URL for a scheme.
 */
function buildAmfiHistoryUrl(schemeCode: number): string {
  return `https://www.amfiindia.com/net-asset-value/mutual-fund-scheme?SchemeCode=${schemeCode}`;
}

/**
 * Verify NAV data for a sample of funds from the FBAR report.
 * Picks up to `sampleSize` funds and cross-checks latest NAV from
 * AMFI (official) vs MFapi.in (used in computations).
 */
export async function verifyFundNavData(
  funds: FbarFundResult[],
  sampleSize = 3
): Promise<VerificationResult[]> {
  // Pick a sample: first, last, and a middle fund (diverse selection)
  const indices: number[] = [];
  if (funds.length <= sampleSize) {
    indices.push(...funds.map((_, i) => i));
  } else {
    indices.push(0); // first
    indices.push(Math.floor(funds.length / 2)); // middle
    indices.push(funds.length - 1); // last
  }

  const sampleFunds = indices.map(i => funds[i]);
  const schemeCodes = sampleFunds.map(f => f.schemeCode);

  // Fetch AMFI official latest NAVs in one batch
  const amfiNavs = await fetchAmfiLatestNavs(schemeCodes);

  // Fetch MFapi latest NAVs in parallel
  const mfapiNavs = await Promise.all(
    schemeCodes.map(code => fetchMfapiLatestNav(code))
  );

  return sampleFunds.map((fund, i) => {
    const amfi = amfiNavs.get(fund.schemeCode);
    const mfapi = mfapiNavs[i];

    // Match if both have values and are within 0.01 tolerance
    const match = !!(amfi && mfapi &&
      Math.abs(amfi.nav - mfapi.nav) < 0.01);

    return {
      schemeName: fund.matchedSchemeName,
      schemeCode: fund.schemeCode,
      amfiNav: amfi?.nav ?? null,
      amfiDate: amfi?.date ?? null,
      mfapiNav: mfapi?.nav ?? null,
      mfapiDate: mfapi?.date ?? null,
      match,
      amfiHistoryUrl: buildAmfiHistoryUrl(fund.schemeCode),
      peakNav: fund.peakNav,
      peakDate: fund.peakValueDate,
      yearEndNav: fund.yearEndNav,
      yearEndDate: fund.yearEndDate,
    };
  });
}
