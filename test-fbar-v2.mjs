/**
 * FBAR computation — uses per-scheme search instead of full list download.
 * MFapi.in search endpoint: https://api.mfapi.in/mf/search?q=SCHEME_NAME
 */
import { readFileSync } from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const YEAR = 2025;
const PDF_PATH = './test-cas.pdf';
const PDF_PASSWORD = 'Taxiq@12';
const MFAPI_BASE = 'https://api.mfapi.in/mf';
const TREASURY_API = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/rates_of_exchange';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------- Step 1: Parse CAS ----------
async function parseCas() {
  const data = new Uint8Array(readFileSync(PDF_PATH));
  const doc = await getDocument({ data, password: PDF_PASSWORD }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(tc.items.map(item => item.str).join(' '));
  }
  const fullText = pages.join('\n');

  const holdings = [];
  const pattern = new RegExp(
    '([\\d][\\d\\/]*)\\s+([\\d,]+\\.\\d{2})\\s+\\w+\\s+-\\s+(.+?)\\s+([\\d,]+\\.\\d{3,4})\\s+(\\d{1,2}-[A-Za-z]+-\\d{4})\\s+([\\d,]+\\.\\d{2,4})\\s+(CAMS|KFINTECH)\\s+(INF\\w+)\\s+([\\d,]+\\.\\d{3})',
    'gi'
  );
  let m;
  while ((m = pattern.exec(fullText)) !== null) {
    holdings.push({
      folio: m[1],
      marketValue: parseFloat(m[2].replace(/,/g, '')),
      schemeName: m[3].trim().replace(/\s+/g, ' ').replace(/\(Demat\)/gi, '').replace(/\(Non-Demat\)/gi, '').trim(),
      units: parseFloat(m[4].replace(/,/g, '')),
      isin: m[8],
    });
  }
  return holdings;
}

// ---------- Step 2: Search scheme by name ----------
async function searchScheme(name) {
  // Extract key words for search
  const keywords = name
    .replace(/\(.*?\)/g, '')
    .replace(/-/g, ' ')
    .replace(/regular|plan|growth|option|formerly|known|as|erstwhile/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 2)
    .slice(0, 4)
    .join(' ');

  const url = `${MFAPI_BASE}/search?q=${encodeURIComponent(keywords)}`;
  try {
    const results = await fetchJson(url);
    if (!results || results.length === 0) return null;

    // Prefer "Regular" + "Growth" match
    const nameL = name.toLowerCase();
    const isRegular = nameL.includes('regular');
    const isGrowth = nameL.includes('growth');

    for (const r of results) {
      const rL = r.schemeName.toLowerCase();
      if (isRegular && rL.includes('regular') && isGrowth && rL.includes('growth')) {
        return r;
      }
    }
    // Fallback: first result
    return results[0];
  } catch (e) {
    return null;
  }
}

// ---------- Step 3: Treasury rate ----------
async function getTreasuryRate() {
  const params = new URLSearchParams({
    filter: `country_currency_desc:eq:India-Rupee,record_date:gte:${YEAR}-01-01,record_date:lte:${YEAR}-12-31`,
    sort: '-record_date',
    'page[size]': '4',
    fields: 'record_date,exchange_rate',
  });
  const data = await fetchJson(`${TREASURY_API}?${params}`);
  const latest = data.data[0];
  return { rate: parseFloat(latest.exchange_rate), date: latest.record_date };
}

// ---------- Step 4: NAV computation ----------
function parseNavDate(dateStr) {
  const [dd, mm, yyyy] = dateStr.split('-');
  return new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
}

async function computeOneFund(h, exchangeRate) {
  const data = await fetchJson(`${MFAPI_BASE}/${h.matchedCode}`);
  const navData = (data.data || [])
    .map(d => ({ date: d.date, nav: parseFloat(d.nav) }))
    .filter(d => parseNavDate(d.date).getFullYear() === YEAR);

  if (navData.length === 0) return null;

  const peak = navData.reduce((mx, d) => d.nav > mx.nav ? d : mx, navData[0]);
  const dec31 = new Date(YEAR, 11, 31);
  let yearEnd = navData[0], minDiff = Infinity;
  for (const d of navData) {
    const diff = Math.abs(parseNavDate(d.date).getTime() - dec31.getTime());
    if (diff < minDiff) { minDiff = diff; yearEnd = d; }
  }

  return {
    schemeName: h.schemeName,
    matchedName: h.matchedName,
    matchedCode: h.matchedCode,
    folio: h.folio,
    units: h.units,
    peakNav: peak.nav, peakDate: peak.date,
    peakINR: h.units * peak.nav,
    peakUSD: (h.units * peak.nav) / exchangeRate,
    yearEndNav: yearEnd.nav, yearEndDate: yearEnd.date,
    yearEndINR: h.units * yearEnd.nav,
    yearEndUSD: (h.units * yearEnd.nav) / exchangeRate,
    navPoints: navData.length,
  };
}

// ---------- Main ----------
async function main() {
  console.log(`╔══════════════════════════════════════════════════╗`);
  console.log(`║  FBAR Computation — Calendar Year ${YEAR}          ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);

  // Parse
  console.log('STEP 1: Parsing CAS PDF...');
  const holdings = await parseCas();
  console.log(`  Found ${holdings.length} holdings\n`);

  // Match each scheme individually
  console.log('STEP 2: Matching schemes via MFapi.in search...');
  const matched = [];
  for (const h of holdings) {
    process.stdout.write(`  Searching: ${h.schemeName.substring(0, 55)}... `);
    const result = await searchScheme(h.schemeName);
    if (result) {
      matched.push({ ...h, matchedCode: result.schemeCode, matchedName: result.schemeName });
      console.log(`✓ code=${result.schemeCode}`);
    } else {
      console.log('✗ NOT FOUND');
    }
  }
  console.log(`  Matched: ${matched.length}/${holdings.length}\n`);

  // Treasury
  console.log('STEP 3: Fetching Treasury exchange rate...');
  const treasury = await getTreasuryRate();
  console.log(`  ₹${treasury.rate} = $1 USD (as of ${treasury.date})\n`);

  // Compute
  console.log('STEP 4: Computing FBAR values...');
  const funds = [];
  for (let i = 0; i < matched.length; i++) {
    const h = matched[i];
    process.stdout.write(`  [${i + 1}/${matched.length}] ${h.schemeName.substring(0, 50)}... `);
    try {
      const result = await computeOneFund(h, treasury.rate);
      if (result) {
        funds.push(result);
        console.log(`peak=$${result.peakUSD.toFixed(0)} yearEnd=$${result.yearEndUSD.toFixed(0)}`);
      } else {
        console.log('NO NAV DATA');
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
    }
  }

  // Report
  const totalPeakUSD = funds.reduce((s, f) => s + f.peakUSD, 0);
  const totalYearEndUSD = funds.reduce((s, f) => s + f.yearEndUSD, 0);
  const totalPeakINR = funds.reduce((s, f) => s + f.peakINR, 0);
  const totalYearEndINR = funds.reduce((s, f) => s + f.yearEndINR, 0);

  console.log(`\n${'═'.repeat(110)}`);
  console.log(`  FBAR REPORT — Calendar Year ${YEAR} | Exchange Rate: ₹${treasury.rate}/$1 USD (${treasury.date})`);
  console.log(`${'═'.repeat(110)}`);
  console.log(
    'Scheme'.padEnd(50) +
    'Units'.padStart(12) +
    'Peak ₹'.padStart(14) +
    'Peak $'.padStart(12) +
    'YrEnd $'.padStart(12) +
    '  Peak Date'
  );
  console.log('─'.repeat(110));

  for (const f of funds) {
    const name = f.schemeName.length > 48 ? f.schemeName.substring(0, 48) + '..' : f.schemeName;
    console.log(
      name.padEnd(50) +
      f.units.toFixed(3).padStart(12) +
      `₹${Math.round(f.peakINR).toLocaleString()}`.padStart(14) +
      `$${f.peakUSD.toFixed(2)}`.padStart(12) +
      `$${f.yearEndUSD.toFixed(2)}`.padStart(12) +
      `  ${f.peakDate}`
    );
  }

  console.log('─'.repeat(110));
  console.log(
    'TOTAL'.padEnd(50) +
    ''.padStart(12) +
    `₹${Math.round(totalPeakINR).toLocaleString()}`.padStart(14) +
    `$${totalPeakUSD.toFixed(2)}`.padStart(12) +
    `$${totalYearEndUSD.toFixed(2)}`.padStart(12)
  );

  console.log(`\n${'═'.repeat(60)}`);
  if (totalPeakUSD > 10000) {
    console.log(`⚠️  FBAR FILING REQUIRED — Peak $${totalPeakUSD.toFixed(2)} > $10,000`);
  } else {
    console.log(`✅ No FBAR filing required — Peak $${totalPeakUSD.toFixed(2)} < $10,000`);
  }
  if (totalPeakUSD > 50000) {
    console.log(`⚠️  FATCA (Form 8938) likely required — Peak $${totalPeakUSD.toFixed(2)} > $50,000`);
  }
  console.log(`${'═'.repeat(60)}`);
  console.log('\nDISCLAIMER: This is not tax advice. Verify all values before filing.');
}

main().catch(e => console.error('Fatal:', e));
