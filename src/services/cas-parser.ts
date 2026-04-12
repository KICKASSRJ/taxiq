/**
 * CAS PDF Parser — extracts mutual fund holdings from CAMS/MFCentral CAS PDFs.
 * Runs entirely client-side using pdfjs-dist. No financial data leaves the browser.
 */
import * as pdfjsLib from 'pdfjs-dist';
import type { CASParseResult, ParsedHolding } from '../types';

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/** Extract all text from a PDF file */
async function extractTextFromPdf(file: File, password?: string): Promise<string[]> {
  console.time('[PERF:parser] file.arrayBuffer');
  const arrayBuffer = await file.arrayBuffer();
  console.timeEnd('[PERF:parser] file.arrayBuffer');
  console.log(`[PERF:parser] PDF size: ${Math.round(arrayBuffer.byteLength / 1024)} KB`);

  console.time('[PERF:parser] pdfjsLib.getDocument');
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    password: password,
  });

  const pdf = await loadingTask.promise;
  console.timeEnd('[PERF:parser] pdfjsLib.getDocument');
  console.log(`[PERF:parser] PDF pages: ${pdf.numPages}`);

  const pages: string[] = [];
  console.time('[PERF:parser] extractAllPages');
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    pages.push(pageText);
  }
  console.timeEnd('[PERF:parser] extractAllPages');

  return pages;
}

// Pre-compiled regex patterns (compiled once at module level, not per call)
const CAMS_SUMMARY_PATTERN = new RegExp(
  '([\\d][\\d\\/]*)' +               // Group 1: Folio number
  '\\s+([\\d,]+\\.\\d{2})' +         // Group 2: Market value (2 decimals)
  '\\s+\\w+\\s+-\\s+' +              // Scheme code + " - "
  '(.+?)' +                           // Group 3: Scheme name (non-greedy)
  '\\s+([\\d,]+\\.\\d{3,4})' +       // Group 4: Unit balance (3-4 decimals)
  '\\s+(\\d{1,2}-[A-Za-z]+-\\d{4})' + // Group 5: NAV date (DD-Mon-YYYY)
  '\\s+([\\d,]+\\.\\d{2,4})' +       // Group 6: NAV
  '\\s+(CAMS|KFINTECH)' +             // Group 7: Registrar
  '\\s+(INF\\w+)' +                   // Group 8: ISIN
  '\\s+([\\d,]+\\.\\d{3})',           // Group 9: Cost value
  'gi'
);

/** Parse CAS text content into structured holdings */
function parseHoldings(fullText: string): {
  holdings: ParsedHolding[];
  investorName: string;
  pan: string;
  email: string;
  statementDate: string;
  errors: string[];
} {
  const holdings: ParsedHolding[] = [];
  const errors: string[] = [];

  // Extract PAN
  const panMatch = fullText.match(/PAN\s*[:\-]?\s*([A-Z]{5}[0-9]{4}[A-Z])/i);
  const pan = panMatch ? panMatch[1].toUpperCase() : '';

  // Extract email
  const emailMatch = fullText.match(/(?:Email\s*(?:Id)?|E-mail)\s*[:\-]?\s*([\w.+-]+@[\w.-]+\.\w+)/i);
  const email = emailMatch ? emailMatch[1] : '';

  // Extract investor name — CAMS puts it right after email line
  let investorName = '';
  const nameAfterEmail = fullText.match(/(?:Email\s*(?:Id)?)\s*[:\-]?\s*[\w.+-]+@[\w.-]+\.\w+\s+([A-Z][A-Z\s]+?)(?=\s{2,}|\n|NO-|[0-9])/i);
  if (nameAfterEmail) {
    investorName = nameAfterEmail[1].trim();
  } else {
    const nameMatch = fullText.match(/(?:Name|Investor)\s*[:\-]?\s*([A-Z][A-Za-z\s]+?)(?=\s{2,}|PAN|Email|Mobile)/i);
    investorName = nameMatch ? nameMatch[1].trim() : '';
  }

  // Extract statement date
  const dateMatch = fullText.match(/(?:As\s+on|Statement|Period|Date)\s*[:\-]?\s*(\d{1,2}[\-\/]\w{3,9}[\-\/]\d{4})/i);
  const statementDate = dateMatch ? dateMatch[1] : '';

  // Strategy 1: CAMS/KFintech CAS Summary — flat table with ISIN markers
  // Reset lastIndex for reuse of global regex
  CAMS_SUMMARY_PATTERN.lastIndex = 0;

  let match;
  while ((match = CAMS_SUMMARY_PATTERN.exec(fullText)) !== null) {
    const folioNumber = match[1];
    const marketValue = parseFloat(match[2].replace(/,/g, ''));
    const schemeName = match[3].trim().replace(/\s+/g, ' ')
      .replace(/\(Demat\)/gi, '').replace(/\(Non-Demat\)/gi, '').trim();
    const units = parseFloat(match[4].replace(/,/g, ''));
    const nav = parseFloat(match[6].replace(/,/g, ''));

    if (units > 0 && schemeName.length > 3) {
      holdings.push({
        amcName: '',
        folioNumber,
        schemeName,
        amfiCode: match[8], // ISIN
        units,
        navAsOfStatement: nav,
        valueAsOfStatement: marketValue,
        pan,
      });
    }
  }

  // Strategy 2: MFCentral Detailed CAS — AMC-sectioned format (fallback)
  if (holdings.length === 0) {
    const amcPattern = /([A-Z][A-Za-z\s&]+(?:Mutual Fund|MF))\s*(?:\(Registrar\s*:\s*\w+\))?/gi;
    const amcSections: { name: string; startIdx: number }[] = [];
    let amcMatch;

    while ((amcMatch = amcPattern.exec(fullText)) !== null) {
      amcSections.push({ name: amcMatch[1].trim(), startIdx: amcMatch.index });
    }

    for (let i = 0; i < amcSections.length; i++) {
      const sectionStart = amcSections[i].startIdx;
      const sectionEnd = i + 1 < amcSections.length ? amcSections[i + 1].startIdx : fullText.length;
      const sectionText = fullText.substring(sectionStart, sectionEnd);
      const amcName = amcSections[i].name;

      const folioPattern = /Folio\s*(?:No|Number)?\s*[:\-]?\s*([\w\/]+)/gi;
      let folioMatch;
      const folios: { number: string; startIdx: number }[] = [];

      while ((folioMatch = folioPattern.exec(sectionText)) !== null) {
        folios.push({ number: folioMatch[1].trim(), startIdx: folioMatch.index });
      }

      for (let j = 0; j < folios.length; j++) {
        const folioStart = folios[j].startIdx;
        const folioEnd = j + 1 < folios.length ? folios[j + 1].startIdx : sectionText.length;
        const folioText = sectionText.substring(folioStart, folioEnd);
        const folioNumber = folios[j].number;

        const schemePattern = /([A-Z][A-Za-z\s\-&()]+(?:Growth|Dividend|IDCW|Direct|Regular|Plan|Fund|Scheme|Option)[A-Za-z\s\-&()]*?)[\s\-]+(?:.*?)(\d+\.\d{3,4})\s+.*?(\d+\.\d{2,4})\s+.*?(\d[\d,]*\.\d{2})/gi;
        let schemeMatch;

        while ((schemeMatch = schemePattern.exec(folioText)) !== null) {
          const schemeName = schemeMatch[1].trim().replace(/\s+/g, ' ');
          const units = parseFloat(schemeMatch[2]);
          const nav = parseFloat(schemeMatch[3]);
          const value = parseFloat(schemeMatch[4].replace(/,/g, ''));

          if (units > 0 && schemeName.length > 5) {
            holdings.push({
              amcName,
              folioNumber,
              schemeName,
              amfiCode: '',
              units,
              navAsOfStatement: nav,
              valueAsOfStatement: value,
              pan,
            });
          }
        }
      }
    }
  }

  if (holdings.length === 0) {
    errors.push(
      'Could not extract mutual fund holdings from this PDF. Please ensure you uploaded a CAS (Consolidated Account Statement) from CAMS or MFCentral.'
    );
  }

  return { holdings, investorName, pan, email, statementDate, errors };
}

/** Main entry point: parse a CAS PDF file */
export async function parseCasPdf(file: File, password?: string): Promise<CASParseResult> {
  try {
    const pages = await extractTextFromPdf(file, password);
    const fullText = pages.join('\n');
    const { holdings, investorName, pan, email, statementDate, errors } = parseHoldings(fullText);

    return {
      success: holdings.length > 0,
      holdings,
      investorName,
      pan,
      email,
      statementDate,
      errors,
    };
  } catch (err: any) {
    if (err?.name === 'PasswordException' || err?.message?.includes('password')) {
      const isRetry = !!password;
      return {
        success: false,
        holdings: [],
        investorName: '',
        pan: '',
        email: '',
        statementDate: '',
        errors: [isRetry
          ? 'Incorrect password. Please check and try again.'
          : 'This PDF is password-protected. Please enter the password (usually: first 4 characters of PAN + DOB in DDMMYYYY format).'],
      };
    }
    return {
      success: false,
      holdings: [],
      investorName: '',
      pan: '',
      email: '',
      statementDate: '',
      errors: [`Failed to parse PDF: ${err?.message || 'Unknown error'}`],
    };
  }
}
