import React, { useEffect, useState } from 'react';
import type { FbarFundResult } from '../types';
import { verifyFundNavData, type VerificationResult } from '../services/verification-service';

interface VerificationPanelProps {
  funds: FbarFundResult[];
}

export function VerificationPanel({ funds }: VerificationPanelProps) {
  const [results, setResults] = useState<VerificationResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const runVerification = async () => {
    setLoading(true);
    setExpanded(true);
    try {
      const res = await verifyFundNavData(funds);
      setResults(res);
    } catch (err) {
      console.error('Verification failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const allMatch = results && results.length > 0 && results.every(r => r.match);
  const someMatch = results && results.some(r => r.match);

  return (
    <div className="verification-panel">
      <div className="verification-header" onClick={() => !results ? runVerification() : setExpanded(!expanded)}>
        <h3>
          🔍 Data Verification
          {results && (
            <span className={`verify-badge ${allMatch ? 'badge-pass' : someMatch ? 'badge-warn' : 'badge-fail'}`}>
              {allMatch ? '✓ All Match' : someMatch ? '⚠ Partial Match' : '✗ Mismatch'}
            </span>
          )}
        </h3>
        <span className="verify-toggle">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="verification-body">
          {!results && !loading && (
            <div className="verify-prompt">
              <p>Cross-check NAV data from <strong>MFapi.in</strong> (used in this report) against <strong>AMFI India</strong> (official regulator source).</p>
              <button className="btn-primary btn-sm" onClick={runVerification}>
                Run Verification
              </button>
            </div>
          )}

          {loading && (
            <div className="verify-loading">
              <div className="spinner" />
              <p>Verifying against AMFI India...</p>
            </div>
          )}

          {results && results.length > 0 && (
            <>
              <p className="verify-desc">
                Compared <strong>latest NAV</strong> from both sources for {results.length} sample fund{results.length > 1 ? 's' : ''}:
              </p>

              <table className="verify-table">
                <thead>
                  <tr>
                    <th>Fund</th>
                    <th>AMFI (Official)</th>
                    <th>MFapi (Report)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i}>
                      <td className="verify-fund-name">
                        {r.schemeName.length > 45 ? r.schemeName.slice(0, 45) + '...' : r.schemeName}
                      </td>
                      <td>{r.amfiNav !== null ? `₹${r.amfiNav.toFixed(4)}` : 'N/A'}{r.amfiDate ? <span className="verify-date"> ({r.amfiDate})</span> : ''}</td>
                      <td>{r.mfapiNav !== null ? `₹${r.mfapiNav.toFixed(4)}` : 'N/A'}{r.mfapiDate ? <span className="verify-date"> ({r.mfapiDate})</span> : ''}</td>
                      <td>
                        {r.match ? (
                          <span className="verify-pass">✓ Match</span>
                        ) : r.amfiNav && r.mfapiNav ? (
                          <span className="verify-warn">⚠ Diff: ₹{Math.abs(r.amfiNav - r.mfapiNav).toFixed(4)}</span>
                        ) : (
                          <span className="verify-na">— N/A</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="verify-manual">
                <h4>📋 Manual Verification Links</h4>
                <p className="text-muted">Verify historical NAVs (peak &amp; year-end dates) used in this report directly on AMFI India:</p>
                <ul className="verify-links">
                  {results.map((r, i) => (
                    <li key={i}>
                      <a href={r.amfiHistoryUrl} target="_blank" rel="noopener noreferrer">
                        {r.schemeName.length > 50 ? r.schemeName.slice(0, 50) + '...' : r.schemeName}
                      </a>
                      <span className="verify-check-dates">
                        — check Peak NAV ₹{r.peakNav.toFixed(4)} on {r.peakDate} and Year-End NAV ₹{r.yearEndNav.toFixed(4)} on {r.yearEndDate}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="verify-note">
                <strong>Note:</strong> Latest NAV comparison confirms the data source (MFapi.in) is in sync with AMFI India.
                For auditable tax filing, use the manual links above to verify the specific peak and year-end NAV values used in your report.
              </div>
            </>
          )}

          {results && results.length === 0 && (
            <div className="verify-error">
              <p>Verification could not be completed — no matched funds available.</p>
              <p style={{marginTop:'0.5rem',fontSize:'0.85rem'}}>This can happen if scheme matching failed. Try re-uploading your CAS PDF (Ctrl+Shift+R to hard refresh first).</p>
              <p style={{marginTop:'0.5rem',fontSize:'0.85rem'}}>
                You can also verify manually at{' '}
                <a href="https://www.amfiindia.com/net-asset-value/nav-history" target="_blank" rel="noopener noreferrer">AMFI India NAV History</a>.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
