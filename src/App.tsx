import React, { useState, useCallback } from 'react';
import type {
  AppStep,
  CASParseResult,
  ParsedHolding,
  SchemeMatchResult,
  FbarReport,
} from './types';
import { Header } from './components/Header';
import { Upload } from './components/Upload';
import { ManualEntry } from './components/ManualEntry';
import { SchemeConfirm } from './components/SchemeConfirm';
import { Computing } from './components/Computing';
import { FbarReportView } from './components/FbarReport';
import { LoginPage } from './components/LoginPage';
import { UserProfile } from './components/UserProfile';
import { parseCasPdf } from './services/cas-parser';
import { resolveSchemeCode } from './services/nav-service';
import { generateFbarReport } from './services/fbar-engine';
import { getDemoMatchResults, DEMO_HOLDINGS } from './utils/demo-data';
import { downloadCsv } from './utils/csv-export';
import { startTrace, traceStart, traceEnd, traceError, endTrace } from './utils/perf-trace';
import { PerfPanel } from './components/PerfPanel';
import type { AuthUser } from './services/auth-service';
import { getStoredUser, isLoggedIn, logout, saveActivity } from './services/auth-service';

type InputMode = 'pdf' | 'manual' | 'demo';

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(getStoredUser());
  const [showProfile, setShowProfile] = useState(false);
  const [step, setStep] = useState<AppStep>('upload');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [parseResult, setParseResult] = useState<CASParseResult | null>(null);
  const [matchResults, setMatchResults] = useState<SchemeMatchResult[]>([]);
  const [report, setReport] = useState<FbarReport | null>(null);
  const [computeProgress, setComputeProgress] = useState({ done: 0, total: 0 });
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear() - 1);
  const [inputMode, setInputMode] = useState<InputMode>('pdf');
  const [statusMsg, setStatusMsg] = useState<string>('');

  // Shared: match holdings using resolveSchemeCode (ISIN first, search fallback)
  const matchHoldings = useCallback(async (holdings: ParsedHolding[]): Promise<SchemeMatchResult[]> => {
    // Resolve all holdings in parallel (ISIN lookup + search fallback built in)
    const tMatch = traceStart('Resolve all scheme codes', 'match', `${holdings.length} holdings`);
    const resolved = await Promise.all(
      holdings.map(h => resolveSchemeCode(h.amfiCode, h.schemeName))
    );
    const matchedCount = resolved.filter(Boolean).length;
    traceEnd(tMatch, `${matchedCount}/${holdings.length} resolved`);

    return holdings.map((holding, i) => {
      const r = resolved[i];
      if (r) {
        return {
          holding,
          matches: [{
            casName: holding.schemeName,
            schemeCode: r.code,
            schemeName: r.name,
            confidence: r.method === 'isin' ? 0.99 : 0.8,
          }],
          selectedMatch: {
            casName: holding.schemeName,
            schemeCode: r.code,
            schemeName: r.name,
            confidence: r.method === 'isin' ? 0.99 : 0.8,
          },
          needsConfirmation: r.method === 'search', // Ask user to confirm search matches
          status: 'matched' as const,
        };
      }
      return {
        holding,
        matches: [],
        selectedMatch: null,
        needsConfirmation: false,
        status: 'unmatched' as const,
      };
    });
  }, []);

  // Step 1a: Handle file upload and parsing (with hard 30s timeout)
  const handleFileSelected = useCallback(async (file: File, password?: string) => {
    setIsLoading(true);
    setError(null);
    setNeedsPassword(false);
    setStatusMsg('Reading PDF file...');

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Processing timed out after 30 seconds. Please check your connection and try again.')), 30000)
    );

    try {
      await Promise.race([timeout, (async () => {
        startTrace();

        setStatusMsg('Parsing PDF...');
        const tParse = traceStart('Parse CAS PDF', 'parse');
        const result = await parseCasPdf(file, password);
        traceEnd(tParse, `${result.holdings.length} holdings`);

        if (!result.success) {
          if (result.errors.some(e => e.includes('password'))) {
            setNeedsPassword(true);
            setError(null);
          } else {
            setError(result.errors.join(' '));
          }
          setIsLoading(false);
          setStatusMsg('');
          return;
        }

        setStatusMsg(`Found ${result.holdings.length} holdings. Matching schemes...`);
        setParseResult(result);
        const matches = await matchHoldings(result.holdings);
        endTrace();
        setStatusMsg('');
        setMatchResults(matches);
        setStep('confirm-schemes');
      })()]);
    } catch (err: any) {
      console.error('[APP] handleFileSelected error:', err);
      setError(err?.message || 'Failed to parse CAS');
      setStatusMsg('');
    } finally {
      setIsLoading(false);
    }
  }, [matchHoldings]);

  // Step 1b: Handle manual entry submission
  const handleManualSubmit = useCallback(async (holdings: ParsedHolding[]) => {
    setIsLoading(true);
    setError(null);

    try {
      const matches = await matchHoldings(holdings);
      setMatchResults(matches);
      setStep('confirm-schemes');
    } catch (err: any) {
      setError(err?.message || 'Failed to match schemes');
    } finally {
      setIsLoading(false);
    }
  }, [matchHoldings]);

  // Step 1c: Launch demo mode
  const handleDemo = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Use pre-mapped matches but also try live matching for accuracy
      let matches: SchemeMatchResult[];
      try {
        matches = await matchHoldings(DEMO_HOLDINGS);
      } catch {
        // Fallback to pre-mapped if API is down
        matches = getDemoMatchResults();
      }
      setMatchResults(matches);
      setStep('confirm-schemes');
    } catch (err: any) {
      setError(err?.message || 'Demo failed');
    } finally {
      setIsLoading(false);
    }
  }, [matchHoldings]);

  // Step 2: Update a scheme match selection
  const handleUpdateMatch = useCallback((index: number, schemeCode: number, schemeName: string) => {
    setMatchResults(prev => {
      const updated = [...prev];
      const mr = { ...updated[index] };
      mr.selectedMatch = {
        casName: mr.holding.schemeName,
        schemeCode,
        schemeName,
        confidence: mr.matches.find(m => m.schemeCode === schemeCode)?.confidence || 0,
      };
      mr.status = 'matched';
      mr.needsConfirmation = false;
      updated[index] = mr;
      return updated;
    });
  }, []);

  // Step 2: Skip an unresolvable scheme
  const handleSkip = useCallback((index: number) => {
    setMatchResults(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], status: 'unmatched', needsConfirmation: false };
      return updated;
    });
  }, []);

  // Step 3: Confirm matches and compute FBAR
  const handleConfirm = useCallback(async (results: SchemeMatchResult[]) => {
    setStep('computing');
    setError(null);

    const total = results.filter(m => m.status === 'matched' && m.selectedMatch).length;
    setComputeProgress({ done: 0, total });

    try {
      startTrace();
      const fbarReport = await generateFbarReport(
        results,
        parseResult?.investorName || '',
        parseResult?.pan || '',
        calendarYear,
        undefined, // no custom rate
        (done, t) => setComputeProgress({ done, total: t })
      );

      setReport(fbarReport);
      endTrace();
      setStep('report');

      // Save activity
      saveActivity('fbar_report',
        `FBAR report for ${calendarYear} — ${fbarReport.funds.length} funds, peak $${fbarReport.totalPeakUSD.toLocaleString()}`,
        {
          year: calendarYear,
          fundsCount: fbarReport.funds.length,
          totalPeakUSD: fbarReport.totalPeakUSD,
          investor: parseResult?.investorName || '',
        }
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to compute FBAR report');
      setStep('confirm-schemes');
    }
  }, [parseResult, calendarYear]);

  // Reset to start over
  const handleReset = useCallback(() => {
    setStep('upload');
    setError(null);
    setIsLoading(false);
    setNeedsPassword(false);
    setParseResult(null);
    setMatchResults([]);
    setReport(null);
  }, []);

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
            {/* Year selector */}
            <div className="year-selector">
              <label htmlFor="year-select">Calendar year for FBAR: </label>
              <select
                id="year-select"
                value={calendarYear}
                onChange={e => setCalendarYear(parseInt(e.target.value))}
              >
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Input mode tabs */}
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
                onFileSelected={handleFileSelected}
                isLoading={isLoading}
                error={error}
                needsPassword={needsPassword}
                statusMessage={statusMsg}
              />
            )}

            {inputMode === 'manual' && (
              <div className="upload-section">
                <div className="step-indicator">Step 1 of 3: Enter your holdings</div>
                {error && <div className="error-message">{error}</div>}
                <ManualEntry onSubmit={handleManualSubmit} isLoading={isLoading} />
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
                    onClick={handleDemo}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Loading demo...' : 'Launch Demo →'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {step === 'confirm-schemes' && (
          <>
            {error && <div className="error-message">{error}</div>}
            <SchemeConfirm
              matchResults={matchResults}
              onConfirm={handleConfirm}
              onUpdateMatch={handleUpdateMatch}
              onSkip={handleSkip}
            />
          </>
        )}

        {step === 'computing' && (
          <Computing
            progress={computeProgress.done}
            total={computeProgress.total}
          />
        )}

        {step === 'report' && report && (
          <>
            <FbarReportView report={report} />
            <div className="actions">
              <button className="btn-primary" onClick={() => {
                downloadCsv(report);
                saveActivity('csv_export', `CSV export for ${report.calendarYear}`, {
                  year: report.calendarYear,
                  funds: report.funds.length,
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
