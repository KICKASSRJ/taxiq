import React, { useState, memo } from 'react';
import type { FbarReport, FbarFundResult } from '../types';
import { VerificationPanel } from './VerificationPanel';

interface FbarReportViewProps {
  report: FbarReport;
}

const FundRow = memo(function FundRow({ fund, exchangeRate }: { fund: FbarFundResult; exchangeRate: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="fund-row" onClick={() => setExpanded(!expanded)}>
        <td className="fund-name">
          <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
          {fund.holding.schemeName}
        </td>
        <td>{fund.holding.folioNumber}</td>
        <td className="num">{fund.peakUnits.toFixed(3)}</td>
        <td className="num">₹{fund.peakValueINR.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td className="num">{fund.peakValueDate}</td>
        <td className="num">${fund.peakValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td className="num">${fund.yearEndValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      </tr>
      {expanded && (
        <tr className="audit-row">
          <td colSpan={7}>
            <div className="audit-detail">
              <h4>Calculation Breakdown</h4>
              <div className="audit-grid">
                <div className="audit-card">
                  <strong>Peak Value</strong>
                  <p>
                    {fund.peakUnits.toFixed(3)} units × ₹{fund.peakNav.toFixed(4)} NAV
                    ({fund.peakValueDate}) = ₹{fund.peakValueINR.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                  <p>
                    ₹{fund.peakValueINR.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ÷ {exchangeRate} = <strong>${fund.peakValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  </p>
                </div>
                <div className="audit-card">
                  <strong>Year-End Value (Dec 31)</strong>
                  <p>
                    {fund.yearEndUnits.toFixed(3)} units × ₹{fund.yearEndNav.toFixed(4)} NAV
                    ({fund.yearEndDate}) = ₹{fund.yearEndValueINR.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                  <p>
                    ₹{fund.yearEndValueINR.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ÷ {exchangeRate} = <strong>${fund.yearEndValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  </p>
                </div>
                <div className="audit-card">
                  <strong>Sources</strong>
                  <p>NAV data: {fund.navSource} ({fund.navDataPointsUsed} data points for {fund.calendarYear})</p>
                  <p>Exchange rate: {fund.exchangeRateSource}</p>
                  <p>Matched scheme: {fund.matchedSchemeName} (code: {fund.schemeCode})</p>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
});

export function FbarReportView({ report }: FbarReportViewProps) {
  return (
    <div className="report-section">
      <div className="step-indicator">Step 3 of 3: Your FBAR Report</div>

      <div className="report-header">
        <h2>FBAR Report — Calendar Year {report.calendarYear}</h2>
        <p className="report-meta">
          {report.investorName && <span>Investor: {report.investorName} | </span>}
          Exchange rate: ₹{report.exchangeRate} = $1 USD
          ({report.isCustomRate ? 'custom rate' : report.exchangeRateSource}) |{' '}
          {report.irsFormRevision}
        </p>
        <p className="report-meta">
          NAV dates are IST (Indian Standard Time). Treasury rates follow US fiscal calendar.
        </p>
      </div>

      <div className="report-totals">
        <div className="total-card">
          <div className="total-label">Total Peak Value (all funds)</div>
          <div className="total-value">${report.totalPeakUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div className="total-note">Maximum aggregate value during {report.calendarYear}</div>
        </div>
        <div className="total-card">
          <div className="total-label">Total Year-End Value</div>
          <div className="total-value">${report.totalYearEndUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div className="total-note">Value as of Dec 31, {report.calendarYear}</div>
        </div>
        <div className="total-card">
          <div className="total-label">Funds Computed</div>
          <div className="total-value">{report.funds.length}</div>
          <div className="total-note">Click any row to see calculation details</div>
        </div>
      </div>

      <table className="fbar-table">
        <thead>
          <tr>
            <th>Scheme Name</th>
            <th>Folio</th>
            <th>Units</th>
            <th>Peak Value (INR)</th>
            <th>Peak Date</th>
            <th>Peak Value (USD)</th>
            <th>Year-End (USD)</th>
          </tr>
        </thead>
        <tbody>
          {report.funds.map((fund) => (
            <FundRow key={fund.schemeCode} fund={fund} exchangeRate={report.exchangeRate} />
          ))}
        </tbody>
      </table>

      <VerificationPanel funds={report.funds} />

      <div className="disclaimer-box">
        <strong>Disclaimer:</strong> {report.disclaimer}
      </div>

      <div className="report-footer">
        <p>
          Report generated: {new Date(report.computedAt).toLocaleString()} |{' '}
          This tool is not a substitute for professional tax advice. Consult a qualified CPA for filing guidance.
        </p>
      </div>
    </div>
  );
}
