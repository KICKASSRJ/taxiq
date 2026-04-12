/**
 * Full FBAR computation for calendar year 2025
 * Using real CAS data + live MFapi.in NAV + Treasury exchange rate
 */
import { readFileSync } from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const YEAR = 2025;
const PDF_PATH = './test-cas.pdf';
const PDF_PASSWORD = 'Taxiq@12';
const MFAPI_BASE = 'https://api.mfapi.in/mf';
const TREASURY_API = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/rates_of_exchange';

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
      nav: parseFloat(m[6].replace(/,/g, '')),
      registrar: m[7],
      isin: m[8],
      cost: parseFloat(m[9].replace(/,/g, '')),
    });
  }
  return holdings;
}

// ---------- Step 2: Fetch scheme list and fuzzy match ----------
function normalize(name) {
  return name.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/\b(the|of|and|in|for|a|an)\b/g, ' ').replace(/[-_&]/g, ' ').replace(/\s+/g, ' ').trim();
}
function tokenize(name) { return normalize(name).split(' ').filter(w => w.length > 1); }
function jaccard(a, b) {
  const sA = new Set(a), sB = new Set(b);
  const inter = [...sA].filter(x => sB.has(x)).length;
  const union = new Set([...sA, ...sB]).size;
  return union === 0 ? 0 : inter / union;
}
function containment(query, cand) {
  const s = new Set(cand);
  return query.length === 0 ? 0 : query.filter(t => s.has(t)).length / query.length;
}

async function matchSchemes(holdings) {
  console.log('Fetching MFapi.in scheme list...');
  const res = await fetch(MFAPI_BASE);
  const schemeList = await res.json();
  console.log(`  ${schemeList.length} schemes loaded\n`);

  const results = [];
  for (const h of holdings) {
    const qTokens = tokenize(h.schemeName);
    let best = null, bestScore = 0;

    for (const s of schemeList) {
      const cTokens = tokenize(s.schemeName);
      const j = jaccard(qTokens, cTokens);
      const c = containment(qTokens, cTokens);
      const score = j * 0.4 + c * 0.6;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }

    results.push({
      ...h,
      matchedCode: best?.schemeCode || 0,
      matchedName: best?.schemeName || '',
      confidence: Math.round(bestScore * 100),
    });
  }
  return results;
}

// ---------- Step 3: Fetch Treasury rate ----------
async function getTreasuryRate() {
  const params = new URLSearchParams({
    filter: `country_currency_desc:eq:India-Rupee,record_date:gte:${YEAR}-01-01,record_date:lte:${YEAR}-12-31`,
    sort: '-record_date',
    'page[size]': '4',
    fields: 'record_date,exchange_rate',
  });
  const res = await fetch(`${TREASURY_API}?${params}`);
  const data = await res.json();
  const latest = data.data[0];
  return { rate: parseFloat(latest.exchange_rate), date: latest.record_date };
}

// ---------- Step 4: Fetch NAV and compute FBAR values ----------
function parseNavDate(dateStr) {
  const [dd, mm, yyyy] = dateStr.split('-');
  return new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
}

async function computeFbar(matched, exchangeRate) {
  const funds = [];

  for (let i = 0; i < matched.length; i++) {
    const h = matched[i];
    process.stdout.write(`  [${i + 1}/${matched.length}] ${h.schemeName.substring(0, 50)}...`);

    try {
      const res = await fetch(`${MFAPI_BASE}/${h.matchedCode}`);
      const data = await res.json();
      const navData = (data.data || [])
        .map(d => ({ date: d.date, nav: parseFloat(d.nav) }))
        .filter(d => {
          const dt = parseNavDate(d.date);
          return dt.getFullYear() === YEAR;
        });

      if (navData.length === 0) {
        console.log(` NO NAV DATA for ${YEAR}`);
        continue;
      }

      // Peak NAV
      const peak = navData.reduce((mx, d) => d.nav > mx.nav ? d : mx, navData[0]);
      const peakValueINR = h.units * peak.nav;

      // Year-end NAV (closest to Dec 31)
      const dec31 = new Date(YEAR, 11, 31);
      let yearEnd = navData[0], minDiff = Infinity;
      for (const d of navData) {
        const diff = Math.abs(parseNavDate(d.date).getTime() - dec31.getTime());
        if (diff < minDiff) { minDiff = diff; yearEnd = d; }
      }
      const yearEndValueINR = h.units * yearEnd.nav;

      const peakUSD = peakValueINR / exchangeRate;
      const yearEndUSD = yearEndValueINR / exchangeRate;

      funds.push({
        schemeName: h.schemeName,
        matchedName: h.matchedName,
        matchedCode: h.matchedCode,
        folio: h.folio,
        units: h.units,
        peakNav: peak.nav,
        peakDate: peak.date,
        peakValueINR,
        peakUSD,
        yearEndNav: yearEnd.nav,
        yearEndDate: yearEnd.date,
        yearEndValueINR,
        yearEndUSD,
        navPoints: navData.length,
      });

      console.log(` ✓ peak=$${peakUSD.toFixed(0)} yearEnd=$${yearEndUSD.toFixed(0)} (${navData.length} NAV points)`);
    } catch (e) {
      console.log(` ERROR: ${e.message}`);
    }
  }

  return funds;
}

// ---------- Main ----------
async function main() {
  console.log(`╔══════════════════════════════════════════════════╗`);
  console.log(`║  FBAR Computation — Calendar Year ${YEAR}          ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);

  // Step 1
  console.log('STEP 1: Parsing CAS PDF...');
  const holdings = await parseCas();
  console.log(`  Found ${holdings.length} holdings\n`);

  // Step 2
  console.log('STEP 2: Matching schemes to MFapi.in...');
  const matched = await matchSchemes(holdings);
  console.log('\nScheme matches:');
  for (const m of matched) {
    console.log(`  ${m.confidence}% | ${m.schemeName}`);
    console.log(`       → ${m.matchedName} (code: ${m.matchedCode})`);
  }

  // Step 3
  console.log('\nSTEP 3: Fetching Treasury exchange rate...');
  const treasury = await getTreasuryRate();
  console.log(`  ₹${treasury.rate} = $1 USD (as of ${treasury.date})\n`);

  // Step 4
  console.log('STEP 4: Computing FBAR values (fetching NAV history for each fund)...');
  const funds = await computeFbar(matched, treasury.rate);

  // Summary
  const totalPeakUSD = funds.reduce((s, f) => s + f.peakUSD, 0);
  const totalYearEndUSD = funds.reduce((s, f) => s + f.yearEndUSD, 0);

  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║                    FBAR REPORT — ${YEAR}                      ║`);
  console.log(`╠══════════════════════════════════════════════════════════════╣`);
  console.log(`║  Exchange Rate: ₹${treasury.rate} / $1 USD (${treasury.date})      ║`);
  console.log(`╠══════════════════════════════════════════════════════════════╣\n`);

  console.log('Scheme'.padEnd(55) + 'Peak (USD)'.padStart(12) + 'YearEnd (USD)'.padStart(15) + '  Peak Date');
  console.log('─'.repeat(95));

  for (const f of funds) {
    const name = f.schemeName.length > 52 ? f.schemeName.substring(0, 52) + '...' : f.schemeName;
    console.log(
      name.padEnd(55) +
      `$${f.peakUSD.toFixed(2)}`.padStart(12) +
      `$${f.yearEndUSD.toFixed(2)}`.padStart(15) +
      `  ${f.peakDate}`
    );
  }

  console.log('─'.repeat(95));
  console.log(
    'TOTAL'.padEnd(55) +
    `$${totalPeakUSD.toFixed(2)}`.padStart(12) +
    `$${totalYearEndUSD.toFixed(2)}`.padStart(15)
  );

  console.log(`\n═══ FBAR Threshold: $10,000 ═══`);
  if (totalPeakUSD > 10000) {
    console.log(`⚠️  Peak value $${totalPeakUSD.toFixed(2)} EXCEEDS $10,000 threshold → FBAR filing required`);
  } else {
    console.log(`✅ Peak value $${totalPeakUSD.toFixed(2)} is below $10,000 → No FBAR filing required`);
  }

  console.log(`\nFunds computed: ${funds.length}/${holdings.length}`);
  console.log('DISCLAIMER: This is not tax advice. Verify all values before filing.');
}

main().catch(e => console.error('Fatal:', e));
