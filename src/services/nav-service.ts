/**
 * NAV Service — fetches historical NAV data from MFapi.in.
 *
 * Matching strategy:
 * 1. ISIN lookup via AMFI India NAV text file (pre-warmed on page load)
 * 2. MFapi.in search API per scheme (fast fallback)
 */
import type { MfApiScheme, SchemeNavHistory, NavDataPoint } from '../types';
import { fuzzyMatchScheme } from '../utils/fuzzy-match';

const MFAPI_BASE = '/proxy/mfapi/mf';
const AMFI_NAV_URL = '/proxy/amfi/spages/NAVAll.txt';

// ──── Fetch with timeout ────

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ──── ISIN Map (AMFI India) ────

let isinMapCache: Map<string, { code: number; name: string }> | null = null;
let isinMapPromise: Promise<Map<string, { code: number; name: string }>> | null = null;

function buildIsinMap(): Promise<Map<string, { code: number; name: string }>> {
  if (isinMapCache) return Promise.resolve(isinMapCache);
  if (isinMapPromise) return isinMapPromise;

  isinMapPromise = (async () => {
    try {
      console.log('[NAV] Downloading AMFI NAVAll.txt...');
      const t0 = performance.now();
      const res = await fetchWithTimeout(AMFI_NAV_URL, 15000);
      if (!res.ok) throw new Error(`AMFI fetch failed: ${res.status}`);
      const text = await res.text();
      console.log(`[NAV] AMFI downloaded: ${Math.round(text.length / 1024)}KB in ${Math.round(performance.now() - t0)}ms`);

      const map = new Map<string, { code: number; name: string }>();
      for (const line of text.split('\n')) {
        const parts = line.split(';');
        if (parts.length >= 4 && /^\d+$/.test(parts[0].trim())) {
          const code = parseInt(parts[0].trim());
          const isinGrowth = parts[1].trim();
          const isinDiv = parts[2].trim();
          const name = parts[3].trim();
          if (isinGrowth && isinGrowth !== '-') map.set(isinGrowth, { code, name });
          if (isinDiv && isinDiv !== '-') map.set(isinDiv, { code, name });
        }
      }
      console.log(`[NAV] ISIN map ready: ${map.size} entries`);
      isinMapCache = map;
      return map;
    } catch (err) {
      console.warn('[NAV] AMFI fetch failed, will use search fallback:', err);
      isinMapPromise = null; // allow retry on next call
      return new Map<string, { code: number; name: string }>();
    }
  })();

  return isinMapPromise;
}

// PRE-WARM: Start downloading AMFI data immediately when this module loads.
// By the time the user selects a file and enters a password (10+ seconds),
// this 3-second download will already be done.
buildIsinMap();

/** Look up a scheme code by ISIN */
export async function lookupByIsin(isin: string): Promise<{ code: number; name: string } | null> {
  const map = await buildIsinMap();
  return map.get(isin) || null;
}

/** Search MFapi.in for schemes by name */
export async function searchSchemes(query: string): Promise<MfApiScheme[]> {
  if (mfapiDown) return []; // Circuit breaker: skip if known down
  try {
    const res = await fetchWithTimeout(`${MFAPI_BASE}/search?q=${encodeURIComponent(query)}`, 4000);
    if (!res.ok) {
      mfapiDown = true; // Mark as down on non-200
      return [];
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      mfapiDown = true;
      return []; // API returned non-JSON (e.g. 502 HTML page)
    }
  } catch {
    mfapiDown = true; // Timeout or network error
    return [];
  }
}

// ──── MFapi Circuit Breaker ────
let mfapiDown = false;

/** Probe MFapi availability once (called before batch matching) */
export async function probeMfapi(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${MFAPI_BASE}/search?q=SBI`, 3000);
    if (!res.ok) { mfapiDown = true; return false; }
    const text = await res.text();
    try { JSON.parse(text); mfapiDown = false; return true; }
    catch { mfapiDown = true; return false; }
  } catch {
    mfapiDown = true;
    return false;
  }
}

/**
 * Resolve a single holding to its MFapi scheme code.
 * Tries ISIN first, then search API.
 */
export async function resolveSchemeCode(
  isin: string | undefined,
  schemeName: string
): Promise<{ code: number; name: string; method: 'isin' | 'search' } | null> {
  // Strategy 1: ISIN lookup
  if (isin && isin.startsWith('INF')) {
    const result = await lookupByIsin(isin);
    if (result) return { ...result, method: 'isin' };
  }

  // Strategy 2: Search MFapi.in by name
  const searchTerms = schemeName
    .replace(/\(.*?\)/g, '')
    .replace(/\b(Direct|Growth|Plan|Regular|Option|Demat|Non)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ');

  if (searchTerms.length > 3) {
    const results = await searchSchemes(searchTerms);
    if (results.length > 0) {
      const direct = results.find(r =>
        r.schemeName.toLowerCase().includes('direct') &&
        r.schemeName.toLowerCase().includes('growth')
      );
      return {
        code: (direct || results[0]).schemeCode,
        name: (direct || results[0]).schemeName,
        method: 'search',
      };
    }
  }

  // Strategy 3: Local fuzzy match against AMFI scheme list (fallback when MFapi is down)
  const schemeList = await fetchSchemeList();
  if (schemeList.length > 0) {
    const matches = fuzzyMatchScheme(schemeName, schemeList, 1);
    if (matches.length > 0 && matches[0].confidence >= 0.4) {
      console.log(`[NAV] Fuzzy matched "${schemeName}" → "${matches[0].name}" (confidence: ${matches[0].confidence})`);
      return { code: matches[0].code, name: matches[0].name, method: 'search' };
    }
    console.warn(`[NAV] Fuzzy match too low for "${schemeName}": best=${matches[0]?.name} confidence=${matches[0]?.confidence}`);
  } else {
    console.warn(`[NAV] No scheme list available for fuzzy matching "${schemeName}"`);
  }

  return null;
}

// ──── Scheme list (for fuzzy matching only) ────

let schemeListCache: MfApiScheme[] | null = null;

export async function fetchSchemeList(): Promise<MfApiScheme[]> {
  if (schemeListCache) return schemeListCache;

  const map = await buildIsinMap();
  console.log(`[NAV] fetchSchemeList: ISIN map has ${map.size} entries`);
  if (map.size > 0) {
    const schemes: MfApiScheme[] = [];
    const seen = new Set<number>();
    for (const { code, name } of map.values()) {
      if (!seen.has(code)) {
        schemes.push({ schemeCode: code, schemeName: name });
        seen.add(code);
      }
    }
    schemeListCache = schemes;
    console.log(`[NAV] Scheme list built: ${schemes.length} unique schemes`);
    return schemes;
  }

  console.warn('[NAV] fetchSchemeList: AMFI data not available, fuzzy match disabled');
  return [];
}

// ──── NAV History ────

const navCache = new Map<number, SchemeNavHistory>();

// AMFI historical NAV cache (shared across all schemes for a year)
let amfiHistoryCache: Map<number, NavDataPoint[]> | null = null;
let amfiHistoryPromise: Promise<Map<number, NavDataPoint[]>> | null = null;

/**
 * Fetch full-year historical NAV from AMFI portal for ALL schemes.
 * Returns a Map: schemeCode → NavDataPoint[]
 * Format: schemeCode;schemeName;ISIN1;ISIN2;NAV;;;dd-Mon-yyyy
 */
async function fetchAmfiHistory(year: number): Promise<Map<number, NavDataPoint[]>> {
  if (amfiHistoryCache) return amfiHistoryCache;
  if (amfiHistoryPromise) return amfiHistoryPromise;

  amfiHistoryPromise = (async () => {
    const map = new Map<number, NavDataPoint[]>();
    try {
      const frmdt = `01-Jan-${year}`;
      const todt = `31-Dec-${year}`;
      console.log(`[NAV] Downloading AMFI historical NAV ${frmdt} to ${todt}...`);
      const t0 = performance.now();
      const res = await fetchWithTimeout(
        `/proxy/amfi-history?frmdt=${encodeURIComponent(frmdt)}&todt=${encodeURIComponent(todt)}`,
        45000
      );
      if (!res.ok) throw new Error(`AMFI history fetch failed: ${res.status}`);
      const text = await res.text();
      console.log(`[NAV] AMFI history downloaded: ${Math.round(text.length / 1024)}KB in ${Math.round(performance.now() - t0)}ms`);

      for (const line of text.split('\n')) {
        const parts = line.split(';');
        // Format: schemeCode;name;ISIN1;ISIN2;NAV;;;date
        if (parts.length >= 8 && /^\d+$/.test(parts[0].trim())) {
          const code = parseInt(parts[0].trim());
          const navVal = parseFloat(parts[4]?.trim());
          const dateStr = parts[7]?.trim(); // dd-Mon-yyyy
          if (!isNaN(navVal) && navVal > 0 && dateStr) {
            // Convert dd-Mon-yyyy to dd-mm-yyyy
            const ddMmYyyy = convertAmfiDate(dateStr);
            if (ddMmYyyy) {
              if (!map.has(code)) map.set(code, []);
              map.get(code)!.push({ date: ddMmYyyy, nav: navVal });
            }
          }
        }
      }
      console.log(`[NAV] AMFI history parsed: ${map.size} schemes`);
    } catch (err) {
      console.warn('[NAV] AMFI history fetch failed:', err);
      amfiHistoryPromise = null;
      return map;
    }
    amfiHistoryCache = map;
    return map;
  })();

  return amfiHistoryPromise;
}

const MONTH_MAP: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

function convertAmfiDate(dateStr: string): string | null {
  // dd-Mon-yyyy → dd-mm-yyyy
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const mm = MONTH_MAP[parts[1]];
  if (!mm) return null;
  return `${parts[0]}-${mm}-${parts[2]}`;
}

export async function fetchSchemeNav(schemeCode: number, year = 2025): Promise<SchemeNavHistory> {
  if (navCache.has(schemeCode)) return navCache.get(schemeCode)!;

  const t0 = performance.now();

  // Strategy 1: Try MFapi.in (if not known down)
  if (!mfapiDown) {
    try {
      const res = await fetchWithTimeout(`${MFAPI_BASE}/${schemeCode}`, 8000);
      if (res.ok) {
        const data = await res.json();
        if (data.data && data.data.length > 0) {
          console.log(`[NAV] Scheme ${schemeCode}: ${data.data.length} points via MFapi in ${Math.round(performance.now() - t0)}ms`);
          const navData: NavDataPoint[] = data.data.map((d: any) => ({
            date: d.date,
            nav: parseFloat(d.nav),
          }));
          const result: SchemeNavHistory = { schemeCode, schemeName: data.meta?.scheme_name || '', navData };
          navCache.set(schemeCode, result);
          return result;
        }
      }
    } catch {
      // MFapi failed, fall through to AMFI history
    }
  }

  // Strategy 2: Use AMFI historical NAV data
  try {
    const historyMap = await fetchAmfiHistory(year);
    const navData = historyMap.get(schemeCode) || [];
    console.log(`[NAV] Scheme ${schemeCode}: ${navData.length} points via AMFI history in ${Math.round(performance.now() - t0)}ms`);
    const result: SchemeNavHistory = { schemeCode, schemeName: '', navData };
    navCache.set(schemeCode, result);
    return result;
  } catch (err) {
    throw new Error(`NAV fetch failed for scheme ${schemeCode}: no data source available`);
  }
}

// ──── NAV Utilities ────

export function parseNavDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return new Date(NaN);
  const [dd, mm, yyyy] = parts;
  return new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
}

export function filterNavByYear(navData: NavDataPoint[], year: number): NavDataPoint[] {
  return navData.filter(d => {
    const date = parseNavDate(d.date);
    return date.getFullYear() === year;
  });
}

export function findPeakNav(navData: NavDataPoint[]): NavDataPoint | null {
  if (navData.length === 0) return null;
  return navData.reduce((max, d) => (d.nav > max.nav ? d : max), navData[0]);
}

export function findYearEndNav(navData: NavDataPoint[], year: number): NavDataPoint | null {
  if (navData.length === 0) return null;

  const dec31 = new Date(year, 11, 31);
  let closest: NavDataPoint | null = null;
  let closestDiff = Infinity;

  for (const d of navData) {
    const date = parseNavDate(d.date);
    const diff = Math.abs(date.getTime() - dec31.getTime());
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = d;
    }
  }

  return closest;
}
