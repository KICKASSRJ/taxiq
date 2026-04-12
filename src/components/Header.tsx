import React from 'react';

export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-left">
          <h1 className="logo">TaxIQ</h1>
          <p className="tagline">FBAR & FATCA for Indian Mutual Funds — in minutes, not hours</p>
        </div>
        {children}
      </div>
    </header>
  );
}
