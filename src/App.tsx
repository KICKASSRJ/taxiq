import { useState, useCallback, useEffect, useMemo } from 'react';
import type { AppStep } from './types';
import { Header } from './components/Header';
import { Upload } from './components/Upload';
import { ManualEntry } from './components/ManualEntry';
import { SchemeConfirm } from './components/SchemeConfirm';
import { Computing } from './components/Computing';
import { FbarReportView } from './components/FbarReport';
import { LoginPage } from './components/LoginPage';
import { UserProfile } from './components/UserProfile';
import { downloadCsv } from './utils/csv-export';
import { PerfPanel } from './components/PerfPanel';
import type { AuthUser } from './services/auth-service';
import { getStoredUser, isLoggedIn, logout, saveActivity } from './services/auth-service';
import { useFileUpload } from './hooks/use-file-upload';
import { useFbarComputation } from './hooks/use-fbar-computation';

type InputMode = 'pdf' | 'manual' | 'demo';

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(getStoredUser());
  const [showProfile, setShowProfile] = useState(false);
  const [step, setStep] = useState<AppStep>('upload');
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear() - 1);
  const [inputMode, setInputMode] = useState<InputMode>('pdf');

  const upload = useFileUpload();
  const fbar = useFbarComputation();

  const yearOptions = useMemo(
    () => Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 - i),
    []
  );

  // Advance to confirm step when matches are populated
  useEffect(() => {
    if (upload.matchResults.length > 0 && step === 'upload') {
      setStep('confirm-schemes');
    }
  }, [upload.matchResults, step]);

  const handleConfirm = useCallback(async (results: import('./types').SchemeMatchResult[]) => {
    setStep('computing');
    const nextStep = await fbar.handleConfirm(results, upload.parseResult, calendarYear);
    setStep(nextStep);
  }, [fbar, upload.parseResult, calendarYear]);

  const handleReset = useCallback(() => {
    setStep('upload');
    upload.reset();
    fbar.reset();
  }, [upload, fbar]);

  const handleLogout = useCallback(() => {
    logout();
    setAuthUser(null);
    setShowProfile(false);
    handleReset();
  }, [handleReset]);

  // Show login page if not authenticated
  if (!authUser || !isLoggedIn()) {
    return (
      <div className="app">
        <LoginPage onAuth={(user) => setAuthUser(user)} />
      </div>
    );
  }

  return (
    <div className="app">
      <Header>
        <div className="user-menu">
          <button className="btn-user" onClick={() => setShowProfile(!showProfile)}>
            👤 {authUser.displayName}
          </button>
          <button className="btn-logout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </Header>
      <PerfPanel />

      {showProfile && (
        <div className="main">
          <UserProfile onClose={() => setShowProfile(false)} />
        </div>
      )}

      {!showProfile && (
      <main className="main">
        {step === 'upload' && (
          <>
            <div className="year-selector">
              <label htmlFor="year-select">Calendar year for FBAR: </label>
              <select
                id="year-select"
                value={calendarYear}
                onChange={e => setCalendarYear(parseInt(e.target.value))}
              >
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="input-mode-tabs">
              <button
                className={`mode-tab ${inputMode === 'pdf' ? 'active' : ''}`}
                onClick={() => setInputMode('pdf')}
              >
                📄 Upload CAS PDF
              </button>
              <button
                className={`mode-tab ${inputMode === 'manual' ? 'active' : ''}`}
                onClick={() => setInputMode('manual')}
              >
                ✏️ Manual Entry
              </button>
              <button
                className={`mode-tab ${inputMode === 'demo' ? 'active' : ''}`}
                onClick={() => setInputMode('demo')}
              >
                🎮 Try Demo
              </button>
            </div>

            {inputMode === 'pdf' && (
              <Upload
                onFileSelected={upload.handleFileSelected}
                isLoading={upload.isLoading}
                error={upload.error}
                needsPassword={upload.needsPassword}
                statusMessage={upload.statusMsg}
              />
            )}

            {inputMode === 'manual' && (
              <div className="upload-section">
                <div className="step-indicator">Step 1 of 3: Enter your holdings</div>
                {upload.error && <div className="error-message">{upload.error}</div>}
                <ManualEntry onSubmit={upload.handleManualSubmit} isLoading={upload.isLoading} />
                <div className="privacy-notice">
                  🔒 All data stays in your browser — nothing is sent to any server.
                </div>
              </div>
            )}

            {inputMode === 'demo' && (
              <div className="upload-section">
                <div className="step-indicator">Demo Mode</div>
                <div className="demo-card">
                  <h3>Try the full FBAR flow with sample data</h3>
                  <p>
                    This loads 5 realistic mutual fund holdings (HDFC Flexi Cap, ICICI Bluechip,
                    SBI Small Cap, Axis Long Term Equity, Parag Parikh Flexi Cap) and runs the
                    complete computation using live NAV data and Treasury exchange rates.
                  </p>
                  <p className="demo-note">
                    No real financial data is used. This is purely for demonstration.
                  </p>
                  <button
                    className="btn-primary"
                    onClick={upload.handleDemo}
                    disabled={upload.isLoading}
                  >
                    {upload.isLoading ? 'Loading demo...' : 'Launch Demo →'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {step === 'confirm-schemes' && (
          <>
            {upload.error && <div className="error-message">{upload.error}</div>}
            <SchemeConfirm
              matchResults={upload.matchResults}
              onConfirm={handleConfirm}
              onUpdateMatch={upload.handleUpdateMatch}
              onSkip={upload.handleSkip}
            />
          </>
        )}

        {step === 'computing' && (
          <Computing
            progress={fbar.computeProgress.done}
            total={fbar.computeProgress.total}
          />
        )}

        {step === 'report' && fbar.report && (
          <>
            <FbarReportView report={fbar.report} />
            <div className="actions">
              <button className="btn-primary" onClick={() => {
                downloadCsv(fbar.report!);
                saveActivity('csv_export', `CSV export for ${fbar.report!.calendarYear}`, {
                  year: fbar.report!.calendarYear,
                  funds: fbar.report!.funds.length,
                });
              }}>
                📥 Download CSV
              </button>
              <button className="btn-secondary" onClick={handleReset}>
                ← Start Over
              </button>
            </div>
          </>
        )}
      </main>
      )}

      <footer className="footer">
        <p>
          This tool is not a substitute for professional tax advice.
          Consult a qualified CPA for filing guidance.
        </p>
        <p>
          All data processed in-browser. No financial information is stored or transmitted.
        </p>
      </footer>
    </div>
  );
}
