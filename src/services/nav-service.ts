/**
 * NAV Service — fetches historical NAV data from MFapi.in.
 *
 * Matching strategy:
 * 1. ISIN lookup via AMFI India NAV text file (pre-warmed on page load)
 * 2. MFapi.in search API per scheme (fast fallback)
 */
import type { MfApiScheme, SchemeNavHistory, NavDataPoint } from '../types';

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
  try {
    const res = await fetchWithTimeout(`${MFAPI_BASE}/search?q=${encodeURIComponent(query)}`, 8000);
    if (!res.ok) return [];
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return []; // API returned non-JSON (e.g. 502 HTML page)
    }
  } catch {
    return [];
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

  return null;
}

// ──── Scheme list (for fuzzy matching only) ────

let schemeListCache: MfApiScheme[] | null = null;

export async function fetchSchemeList(): Promise<MfApiScheme[]> {
  if (schemeListCache) return schemeListCache;

  const map = await buildIsinMap();
  if (map.size > 1000) {
    const schemes: MfApiScheme[] = [];
    const seen = new Set<number>();
    for (const { code, name } of map.values()) {
      if (!seen.has(code)) {
        schemes.push({ schemeCode: code, schemeName: name });
        seen.add(code);
      }
    }
    schemeListCache = schemes;
    return schemes;
  }

  return [];
}

// ──── NAV History ────

const navCache = new Map<number, SchemeNavHistory>();

export async function fetchSchemeNav(schemeCode: number): Promise<SchemeNavHistory> {
  if (navCache.has(schemeCode)) return navCache.get(schemeCode)!;

  const t0 = performance.now();
  const res = await fetchWithTimeout(`${MFAPI_BASE}/${schemeCode}`);
  if (!res.ok) throw new Error(`NAV fetch failed for scheme ${schemeCode}: ${res.status}`);

  const data = await res.json();
  console.log(`[NAV] Scheme ${schemeCode}: ${data.data?.length || 0} points in ${Math.round(performance.now() - t0)}ms`);

  const navData: NavDataPoint[] = (data.data || []).map((d: any) => ({
    date: d.date,
    nav: parseFloat(d.nav),
  }));

  const result: SchemeNavHistory = {
    schemeCode,
    schemeName: data.meta?.scheme_name || '',
    navData,
  };
  navCache.set(schemeCode, result);
  return result;
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
