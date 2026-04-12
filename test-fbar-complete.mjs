/**
 * Complete FBAR computation — all 14 holdings with verified scheme codes.
 */
import { readFileSync } from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const YEAR = 2025;
const MFAPI = 'https://api.mfapi.in/mf';
const TREASURY = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/rates_of_exchange';

// Manually verified ISIN → MFapi.in code mapping
const ISIN_TO_CODE = {
  'INF209K01EN2': 105804,   // Aditya Birla Sun Life Small Cap Fund Growth
  'INF209K01462': 103309,   // Aditya Birla Sun Life Focused Fund Growth
  'INF846K01CH7': 117560,   // Axis Focused Fund Regular Growth
  'INF760K01019': 101922,   // Canara Robeco Flexicap Fund Regular Growth
  'INF090I01742': 118537,   // Franklin India Technology Fund Growth
  'INF179KA1RZ8': 130501,   // HDFC Small Cap Fund Regular Growth
  'INF179KA1RT1': 130496,   // HDFC Large and Mid Cap Fund Regular Growth
  'INF917K01254': 151034,   // HSBC Midcap Fund Regular Growth
  'INF205K01189': 105460,   // Invesco India Contra Fund Regular Growth
  'INF205K011T7': 145139,   // Invesco India Smallcap Fund Regular Growth
  'INF174K01DS9': 103234,   // Kotak Midcap Fund Regular Growth
  'INF204K01323': 100375,   // Nippon India Growth Mid Cap Fund
  'INF200K01222': 103215,   // SBI Flexicap Fund Regular Growth
  'INF200K01LQ9': 101206,   // SBI Overnight Fund Regular Growth
};

function parseNavDate(dateStr) {
  const [dd, mm, yyyy] = dateStr.split('-');
  return new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
}

async function main() {
  // Parse CAS
  const data = new Uint8Array(readFileSync('./test-cas.pdf'));
  const doc = await getDocument({ data, password: 'Taxiq@12' }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(tc.items.map(it => it.str).join(' '));
  }
  const fullText = pages.join('\n');

  const holdings = [];
  const pat = /(\d[\d\/]*)\s+([\d,]+\.\d{2})\s+\w+\s+-\s+(.+?)\s+([\d,]+\.\d{3,4})\s+(\d{1,2}-[A-Za-z]+-\d{4})\s+([\d,]+\.\d{2,4})\s+(CAMS|KFINTECH)\s+(INF\w+)\s+([\d,]+\.\d{3})/gi;
  let m;
  while ((m = pat.exec(fullText)) !== null) {
    holdings.push({
      folio: m[1],
      value: parseFloat(m[2].replace(/,/g, '')),
      name: m[3].trim().replace(/\s+/g, ' ').replace(/\(Demat\)/gi, '').replace(/\(Non-Demat\)/gi, '').trim(),
      units: parseFloat(m[4].replace(/,/g, '')),
      isin: m[8],
      code: ISIN_TO_CODE[m[8]] || 0,
    });
  }
  console.log(`Parsed ${holdings.length} holdings\n`);

  // Treasury rate
  const tParams = new URLSearchParams({
    filter: `country_currency_desc:eq:India-Rupee,record_date:gte:${YEAR}-01-01,record_date:lte:${YEAR}-12-31`,
    sort: '-record_date', 'page[size]': '4', fields: 'record_date,exchange_rate',
  });
  const tRes = await (await fetch(`${TREASURY}?${tParams}`)).json();
  const rate = parseFloat(tRes.data[0].exchange_rate);
  console.log(`Exchange rate: ₹${rate} = $1 USD (${tRes.data[0].record_date})\n`);

  // Compute each fund
  const funds = [];
  for (const h of holdings) {
    if (!h.code) { console.log(`SKIP: ${h.name} (no code)`); continue; }
    process.stdout.write(`${h.name.substring(0, 55).padEnd(55)} `);

    const navRes = await (await fetch(`${MFAPI}/${h.code}`)).json();
    const navData = (navRes.data || [])
      .map(d => ({ date: d.date, nav: parseFloat(d.nav) }))
      .filter(d => parseNavDate(d.date).getFullYear() === YEAR);

    if (navData.length === 0) { console.log('NO DATA'); continue; }

    const peak = navData.reduce((mx, d) => d.nav > mx.nav ? d : mx, navData[0]);
    const dec31 = new Date(YEAR, 11, 31);
    let ye = navData[0], minD = Infinity;
    for (const d of navData) {
      const diff = Math.abs(parseNavDate(d.date).getTime() - dec31.getTime());
      if (diff < minD) { minD = diff; ye = d; }
    }

    const f = {
      name: h.name, folio: h.folio, units: h.units, code: h.code,
      peakNav: peak.nav, peakDate: peak.date,
      peakINR: h.units * peak.nav, peakUSD: (h.units * peak.nav) / rate,
      yeNav: ye.nav, yeDate: ye.date,
      yeINR: h.units * ye.nav, yeUSD: (h.units * ye.nav) / rate,
      pts: navData.length,
    };
    funds.push(f);
    console.log(`peak=$${f.peakUSD.toFixed(0).padStart(6)}  ye=$${f.yeUSD.toFixed(0).padStart(6)}  (${peak.date})`);
  }

  // Report
  const tPeak = funds.reduce((s, f) => s + f.peakUSD, 0);
  const tYE = funds.reduce((s, f) => s + f.yeUSD, 0);
  const tPeakINR = funds.reduce((s, f) => s + f.peakINR, 0);

  console.log(`\n${'═'.repeat(120)}`);
  console.log(`  FBAR REPORT — Calendar Year ${YEAR}`);
  console.log(`  Investor: RANJJINI GOPALAIAH SANDA | Exchange Rate: ₹${rate}/$1 (US Treasury, Dec 31 ${YEAR})`);
  console.log(`${'═'.repeat(120)}`);
  console.log(
    '#'.padStart(3) +
    'Scheme'.padEnd(52) +
    'Folio'.padEnd(18) +
    'Units'.padStart(12) +
    'Peak(INR)'.padStart(14) +
    'Peak(USD)'.padStart(12) +
    'YrEnd(USD)'.padStart(12) +
    '  Peak Date'
  );
  console.log('─'.repeat(120));

  funds.forEach((f, i) => {
    const nm = f.name.length > 50 ? f.name.substring(0, 48) + '..' : f.name;
    console.log(
      String(i + 1).padStart(3) + ' ' +
      nm.padEnd(51) +
      f.folio.padEnd(18) +
      f.units.toFixed(3).padStart(12) +
      `₹${Math.round(f.peakINR).toLocaleString()}`.padStart(14) +
      `$${f.peakUSD.toFixed(2)}`.padStart(12) +
      `$${f.yeUSD.toFixed(2)}`.padStart(12) +
      `  ${f.peakDate}`
    );
  });

  console.log('─'.repeat(120));
  console.log(
    '    ' + 'TOTAL'.padEnd(51) + ''.padEnd(18) + ''.padStart(12) +
    `₹${Math.round(tPeakINR).toLocaleString()}`.padStart(14) +
    `$${tPeak.toFixed(2)}`.padStart(12) +
    `$${tYE.toFixed(2)}`.padStart(12)
  );

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  Total funds: ${funds.length}/${holdings.length}`);
  if (tPeak > 10000) console.log(`  ⚠️  FBAR REQUIRED — Peak $${tPeak.toFixed(2)} exceeds $10,000`);
  if (tPeak > 50000) console.log(`  ⚠️  FATCA (Form 8938) likely required — Peak $${tPeak.toFixed(2)} exceeds $50,000`);
  console.log(`${'═'.repeat(70)}`);
  console.log('\n  DISCLAIMER: Not tax advice. Verify values with a CPA before filing.');
}

main().catch(e => console.error('Fatal:', e));
