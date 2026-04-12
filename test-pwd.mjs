import { readFileSync } from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = './test-cas.pdf';

// Try multiple password variants
const passwords = [
  'Taxia@12',
  'taxia@12',
  'TAXIA@12',
  'Taxia@12 ',
  '',        // no password
];

async function tryPassword(pwd) {
  try {
    const data = new Uint8Array(readFileSync(pdfPath));
    const opts = { data };
    if (pwd) opts.password = pwd;
    const doc = await getDocument(opts).promise;
    console.log(`✅ Password worked: "${pwd}" — Pages: ${doc.numPages}`);
    return doc;
  } catch (e) {
    console.log(`❌ "${pwd}" — ${e.message}`);
    return null;
  }
}

async function run() {
  for (const pwd of passwords) {
    const doc = await tryPassword(pwd);
    if (doc) {
      // Print first 2 pages
      for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        const text = tc.items.map(item => item.str).join(' ');
        console.log(`\n=== PAGE ${i} (first 1000 chars) ===`);
        console.log(text.substring(0, 1000));
      }
      return;
    }
  }
  console.log('\nNone of the passwords worked. The PDF may need the exact password.');
}

run().catch(e => console.error('Fatal:', e));
