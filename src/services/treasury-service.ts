/**
 * Treasury Rate Service — fetches INR/USD exchange rates from
 * US Treasury fiscaldata.treasury.gov API.
 *
 * For FBAR/FATCA, the Dec 31 Treasury reporting rate is used.
 */
import type { TreasuryRate } from '../types';

const TREASURY_API =
  '/proxy/treasury/services/api/fiscal_service/v1/accounting/od/rates_of_exchange';

/**
 * Fetch the Treasury exchange rate for India-Rupee for a specific year.
 * Returns the Dec 31 (Q4) rate, or the latest available rate for that year.
 */
export async function fetchTreasuryRate(year: number): Promise<TreasuryRate | null> {
  const params = new URLSearchParams({
    'filter': `country_currency_desc:eq:India-Rupee,record_date:gte:${year}-01-01,record_date:lte:${year}-12-31`,
    'sort': '-record_date',
    'page[size]': '4',
    'fields': 'record_date,country_currency_desc,exchange_rate,effective_date',
  });

  try {
    const res = await fetch(`${TREASURY_API}?${params}`);
    if (!res.ok) throw new Error(`Treasury API fetch failed: ${res.status}`);

    const data = await res.json();
    const records = data?.data || [];

    if (records.length === 0) return null;

    // Get the latest rate for the year (will be closest to Dec 31)
    const latest = records[0];
    return {
      recordDate: latest.record_date,
      country: 'India',
      currency: 'Rupee',
      exchangeRate: parseFloat(latest.exchange_rate),
    };
  } catch (err) {
    console.error('Treasury API error:', err);
    return null;
  }
}

/**
 * Convert INR to USD using Treasury rate.
 * Treasury rate = how many INR per 1 USD.
 * USD = INR / rate
 */
export function convertInrToUsd(inrAmount: number, treasuryRate: number): number {
  if (treasuryRate <= 0) return 0;
  return Math.round((inrAmount / treasuryRate) * 100) / 100;
}
