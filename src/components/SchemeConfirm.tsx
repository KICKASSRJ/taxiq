import React, { useMemo } from 'react';
import type { SchemeMatchResult } from '../types';

interface SchemeConfirmProps {
  matchResults: SchemeMatchResult[];
  onConfirm: (results: SchemeMatchResult[]) => void;
  onUpdateMatch: (index: number, schemeCode: number, schemeName: string) => void;
  onSkip: (index: number) => void;
}

export function SchemeConfirm({ matchResults, onConfirm, onUpdateMatch, onSkip }: SchemeConfirmProps) {
  const { matched, ambiguous, unmatched } = useMemo(() => ({
    matched: matchResults.filter(m => m.status === 'matched'),
    ambiguous: matchResults.filter(m => m.status === 'ambiguous'),
    unmatched: matchResults.filter(m => m.status === 'unmatched'),
  }), [matchResults]);
  const allResolved = ambiguous.length === 0;

  return (
    <div className="scheme-confirm-section">
      <div className="step-indicator">Step 2 of 3: Confirm scheme matches</div>

      <div className="match-summary">
        <span className="match-badge matched">{matched.length} matched</span>
        {ambiguous.length > 0 && (
          <span className="match-badge ambiguous">{ambiguous.length} need confirmation</span>
        )}
        {unmatched.length > 0 && (
          <span className="match-badge unmatched">{unmatched.length} unmatched</span>
        )}
      </div>

      {ambiguous.length > 0 && (
        <div className="ambiguous-section">
          <h3>Please confirm these scheme matches:</h3>
          {matchResults.map((mr, idx) => {
            if (mr.status !== 'ambiguous') return null;
            return (
              <div key={idx} className="ambiguous-card">
                <div className="cas-name">
                  <strong>CAS:</strong> {mr.holding.schemeName}
                </div>
                <div className="match-options">
                  <select
                    value={mr.selectedMatch?.schemeCode || ''}
                    onChange={e => {
                      const code = parseInt(e.target.value);
                      const match = mr.matches.find(m => m.schemeCode === code);
                      if (match) onUpdateMatch(idx, match.schemeCode, match.schemeName);
                    }}
                  >
                    <option value="">Select the correct scheme...</option>
                    {mr.matches.map(m => (
                      <option key={m.schemeCode} value={m.schemeCode}>
                        {m.schemeName} ({(m.confidence * 100).toFixed(0)}% match)
                      </option>
                    ))}
                  </select>
                  <button className="skip-btn" onClick={() => onSkip(idx)}>
                    Skip this fund
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {matched.length > 0 && (
        <details className="matched-section" open={ambiguous.length === 0}>
          <summary>Auto-matched schemes ({matched.length})</summary>
          <table className="scheme-table">
            <thead>
              <tr>
                <th>CAS Scheme Name</th>
                <th>Matched To (MFapi.in)</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {matchResults.map((mr, idx) => {
                if (mr.status !== 'matched' || !mr.selectedMatch) return null;
                return (
                  <tr key={idx}>
                    <td>{mr.holding.schemeName}</td>
                    <td>{mr.selectedMatch.schemeName}</td>
                    <td>{(mr.selectedMatch.confidence * 100).toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}

      {unmatched.length > 0 && (
        <div className="unmatched-section">
          <h3>Unmatched schemes (will be skipped):</h3>
          {matchResults.map((mr, idx) => {
            if (mr.status !== 'unmatched') return null;
            return (
              <div key={idx} className="unmatched-card">
                {mr.holding.schemeName}
                <span className="unmatched-note">
                  This scheme may have been renamed or merged. You can add it manually to your FBAR.
                </span>
              </div>
            );
          })}
        </div>
      )}

      <button
        className="btn-primary"
        onClick={() => onConfirm(matchResults)}
        disabled={!allResolved && ambiguous.length > 0}
      >
        {allResolved
          ? `Compute FBAR for ${matched.length} funds →`
          : `Resolve ${ambiguous.length} ambiguous match(es) above`}
      </button>
    </div>
  );
}
