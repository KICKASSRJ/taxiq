/**
 * CSV Export — generates a downloadable CSV file from an FBAR report.
 */
import type { FbarReport } from '../types';

function escapeCsv(val: string | number): string {
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateFbarCsv(report: FbarReport): string {
  const lines: string[] = [];

  // Header metadata
  lines.push(`FBAR Report — Calendar Year ${report.calendarYear}`);
  lines.push(`Generated: ${new Date(report.computedAt).toLocaleString()}`);
  if (report.investorName) lines.push(`Investor: ${report.investorName}`);
  lines.push(`Exchange Rate: ${report.exchangeRate} INR/USD (${report.exchangeRateSource})`);
  lines.push(`Form: ${report.irsFormRevision}`);
  lines.push('');

  // Summary
  lines.push(`Total Peak Value (USD),${report.totalPeakUSD.toFixed(2)}`);
  lines.push(`Total Year-End Value (USD),${report.totalYearEndUSD.toFixed(2)}`);
  lines.push(`Funds Computed,${report.funds.length}`);
  lines.push('');

  // Column headers
  lines.push([
    'Scheme Name',
    'Folio Number',
    'Units',
    'Peak NAV',
    'Peak Date',
    'Peak Value (INR)',
    'Peak Value (USD)',
    'Year-End NAV',
    'Year-End Date',
    'Year-End Value (INR)',
    'Year-End Value (USD)',
    'Matched Scheme (MFapi.in)',
    'Scheme Code',
    'NAV Data Points',
    'Exchange Rate',
  ].join(','));

  // Data rows
  for (const fund of report.funds) {
    lines.push([
      escapeCsv(fund.holding.schemeName),
      escapeCsv(fund.holding.folioNumber),
      fund.peakUnits.toFixed(3),
      fund.peakNav.toFixed(4),
      fund.peakValueDate,
      fund.peakValueINR.toFixed(2),
      fund.peakValueUSD.toFixed(2),
      fund.yearEndNav.toFixed(4),
      fund.yearEndDate,
      fund.yearEndValueINR.toFixed(2),
      fund.yearEndValueUSD.toFixed(2),
      escapeCsv(fund.matchedSchemeName),
      fund.schemeCode,
      fund.navDataPointsUsed,
      fund.exchangeRate,
    ].join(','));
  }

  lines.push('');
  lines.push(`"${report.disclaimer}"`);

  return lines.join('\n');
}

export function downloadCsv(report: FbarReport): void {
  const csv = generateFbarCsv(report);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `fbar-report-${report.calendarYear}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
