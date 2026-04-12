import React, { useState } from 'react';
import type { ParsedHolding } from '../types';

interface ManualEntryProps {
  onSubmit: (holdings: ParsedHolding[]) => void;
  isLoading: boolean;
}

interface EntryRow {
  schemeName: string;
  units: string;
  folioNumber: string;
}

const EMPTY_ROW: EntryRow = { schemeName: '', units: '', folioNumber: '' };

export function ManualEntry({ onSubmit, isLoading }: ManualEntryProps) {
  const [rows, setRows] = useState<EntryRow[]>([{ ...EMPTY_ROW }]);
  const [investorName, setInvestorName] = useState('');

  const updateRow = (idx: number, field: keyof EntryRow, value: string) => {
    setRows(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const addRow = () => setRows(prev => [...prev, { ...EMPTY_ROW }]);

  const removeRow = (idx: number) => {
    if (rows.length > 1) setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    const holdings: ParsedHolding[] = rows
      .filter(r => r.schemeName.trim() && parseFloat(r.units) > 0)
      .map(r => ({
        amcName: '',
        folioNumber: r.folioNumber.trim() || 'MANUAL',
        schemeName: r.schemeName.trim(),
        amfiCode: '',
        units: parseFloat(r.units),
        navAsOfStatement: 0,
        valueAsOfStatement: 0,
        pan: '',
      }));

    if (holdings.length === 0) return;
    onSubmit(holdings);
  };

  const validCount = rows.filter(r => r.schemeName.trim() && parseFloat(r.units) > 0).length;

  return (
    <div className="manual-entry-section">
      <p className="manual-hint">
        Enter your mutual fund scheme names and current units held.
        Scheme names are fuzzy-matched to the MFapi.in database — partial names are fine.
      </p>

      <div className="manual-investor">
        <label>Investor name (optional):</label>
        <input
          type="text"
          value={investorName}
          onChange={e => setInvestorName(e.target.value)}
          placeholder="e.g., Raj Patel"
        />
      </div>

      <table className="manual-table">
        <thead>
          <tr>
            <th>Scheme Name</th>
            <th>Units Held</th>
            <th>Folio (opt.)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              <td>
                <input
                  type="text"
                  value={row.schemeName}
                  onChange={e => updateRow(idx, 'schemeName', e.target.value)}
                  placeholder="e.g., HDFC Flexi Cap Direct Growth"
                />
              </td>
              <td>
                <input
                  type="number"
                  value={row.units}
                  onChange={e => updateRow(idx, 'units', e.target.value)}
                  placeholder="e.g., 150.250"
                  step="0.001"
                  min="0"
                />
              </td>
              <td>
                <input
                  type="text"
                  value={row.folioNumber}
                  onChange={e => updateRow(idx, 'folioNumber', e.target.value)}
                  placeholder="optional"
                />
              </td>
              <td>
                <button
                  className="remove-row-btn"
                  onClick={() => removeRow(idx)}
                  disabled={rows.length === 1}
                  title="Remove row"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="manual-actions">
        <button className="btn-secondary" onClick={addRow}>+ Add another fund</button>
        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={validCount === 0 || isLoading}
        >
          {isLoading ? 'Matching...' : `Match ${validCount} fund${validCount !== 1 ? 's' : ''} →`}
        </button>
      </div>
    </div>
  );
}
