import { readFileSync } from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = './test-cas.pdf';
const password = 'Taxia@12';

async function run() {
  const data = new Uint8Array(readFileSync(pdfPath));
  console.log(`PDF size: ${data.length} bytes`);

  const doc = await getDocument({ data, password }).promise;
  console.log(`Pages: ${doc.numPages}\n`);

  const allText = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const pageText = tc.items.map(item => item.str).join(' ');
    allText.push(pageText);
    
    // Print first 500 chars of each page for debugging
    console.log(`=== PAGE ${i} (first 500 chars) ===`);
    console.log(pageText.substring(0, 500));
    console.log('');
  }

  const fullText = allText.join('\n');

  // Extract PAN
  const panMatch = fullText.match(/PAN\s*[:\-]?\s*([A-Z]{5}[0-9]{4}[A-Z])/i);
  console.log('PAN:', panMatch ? panMatch[1] : 'NOT FOUND');

  // Extract investor name
  const nameMatch = fullText.match(/(?:Name|Investor)\s*[:\-]?\s*([A-Z][A-Za-z\s]+?)(?=\s{2,}|PAN|Email|Mobile)/i);
  console.log('Name:', nameMatch ? nameMatch[1].trim() : 'NOT FOUND');

  // Extract email
  const emailMatch = fullText.match(/(?:Email|E-mail)\s*[:\-]?\s*([\w.+-]+@[\w.-]+\.\w+)/i);
  console.log('Email:', emailMatch ? emailMatch[1] : 'NOT FOUND');

  // Look for folio patterns
  const folioMatches = fullText.match(/Folio\s*(?:No|Number)?\s*[:\-]?\s*([\w\/]+)/gi);
  console.log('\nFolios found:', folioMatches ? folioMatches.length : 0);
  if (folioMatches) folioMatches.forEach(f => console.log(' ', f));

  // Look for AMC sections
  const amcPattern = /([A-Z][A-Za-z\s&]+(?:Mutual Fund|MF))/gi;
  const amcMatches = [...new Set((fullText.match(amcPattern) || []).map(s => s.trim()))];
  console.log('\nAMCs found:', amcMatches.length);
  amcMatches.forEach(a => console.log(' ', a));

  // Print full text for analysis (first 5000 chars)
  console.log('\n=== FULL TEXT (first 5000 chars) ===');
  console.log(fullText.substring(0, 5000));
}

run().catch(e => console.error('Error:', e.message));
