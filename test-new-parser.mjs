import { readFileSync } from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = './test-cas.pdf';
const password = 'Taxiq@12';

async function run() {
  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await getDocument({ data, password }).promise;
  
  const allText = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    allText.push(tc.items.map(item => item.str).join(' '));
  }
  const fullText = allText.join('\n');

  // Test the CAMS Summary regex
  const camsSummaryPattern = new RegExp(
    '([\\d][\\d\\/]*)' +
    '\\s+([\\d,]+\\.\\d{2})' +
    '\\s+\\w+\\s+-\\s+' +
    '(.+?)' +
    '\\s+([\\d,]+\\.\\d{3,4})' +
    '\\s+(\\d{1,2}-[A-Za-z]+-\\d{4})' +
    '\\s+([\\d,]+\\.\\d{2,4})' +
    '\\s+(CAMS|KFINTECH)' +
    '\\s+(INF\\w+)' +
    '\\s+([\\d,]+\\.\\d{3})',
    'gi'
  );

  let match;
  let count = 0;
  while ((match = camsSummaryPattern.exec(fullText)) !== null) {
    count++;
    const schemeName = match[3].trim().replace(/\s+/g, ' ')
      .replace(/\(Demat\)/gi, '').replace(/\(Non-Demat\)/gi, '').trim();
    console.log(`\n--- Holding #${count} ---`);
    console.log(`Folio: ${match[1]}`);
    console.log(`Value: ₹${match[2]}`);
    console.log(`Scheme: ${schemeName}`);
    console.log(`Units: ${match[4]}`);
    console.log(`NAV Date: ${match[5]}`);
    console.log(`NAV: ${match[6]}`);
    console.log(`Registrar: ${match[7]}`);
    console.log(`ISIN: ${match[8]}`);
    console.log(`Cost: ₹${match[9]}`);
  }

  console.log(`\n=== Total holdings found: ${count} ===`);

  // Test metadata extraction
  const emailMatch = fullText.match(/(?:Email\s*(?:Id)?|E-mail)\s*[:\-]?\s*([\w.+-]+@[\w.-]+\.\w+)/i);
  console.log(`\nEmail: ${emailMatch ? emailMatch[1] : 'NOT FOUND'}`);

  const nameMatch = fullText.match(/(?:Email\s*(?:Id)?)\s*[:\-]?\s*[\w.+-]+@[\w.-]+\.\w+\s+([A-Z][A-Z\s]+?)(?=\s{2,}|\n|NO-|[0-9])/i);
  console.log(`Name: ${nameMatch ? nameMatch[1].trim() : 'NOT FOUND'}`);

  const dateMatch = fullText.match(/(?:As\s+on|Statement|Period|Date)\s*[:\-]?\s*(\d{1,2}[\-\/]\w{3,9}[\-\/]\d{4})/i);
  console.log(`Statement Date: ${dateMatch ? dateMatch[1] : 'NOT FOUND'}`);
}

run().catch(e => console.error('Error:', e.message));
