import React from 'react';

export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-left">
          <h1 className="logo">₹→$ CAMS MF Tax Tracker</h1>
          <p className="tagline">Your FBAR numbers, in 5 minutes. No spreadsheets required.</p>
        </div>
        {children}
      </div>
    </header>
  );
}
