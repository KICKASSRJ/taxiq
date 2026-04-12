import React from 'react';

interface ComputingProps {
  progress: number;
  total: number;
}

export function Computing({ progress, total }: ComputingProps) {
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <div className="computing-section">
      <div className="spinner large" />
      <h3>Computing FBAR values...</h3>
      <p>
        Fetching NAV history and computing peak values for each fund.
        <br />
        {progress} of {total} funds processed ({pct}%)
      </p>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
