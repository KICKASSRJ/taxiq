import { useState, useCallback } from 'react';
import type { CASParseResult, ParsedHolding, SchemeMatchResult } from '../types';
import { parseCasPdf } from '../services/cas-parser';
import { resolveSchemeCode } from '../services/nav-service';
import { getDemoMatchResults, DEMO_HOLDINGS } from '../utils/demo-data';
import { startTrace, traceStart, traceEnd, endTrace } from '../utils/perf-trace';

function buildMatchResults(holdings: ParsedHolding[], resolved: ({ code: number; name: string; method: 'isin' | 'search' } | null)[]): SchemeMatchResult[] {
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
        needsConfirmation: r.method === 'search',
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
}

export function useFileUpload() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [parseResult, setParseResult] = useState<CASParseResult | null>(null);
  const [matchResults, setMatchResults] = useState<SchemeMatchResult[]>([]);
  const [statusMsg, setStatusMsg] = useState('');

  const matchHoldings = useCallback(async (holdings: ParsedHolding[]): Promise<SchemeMatchResult[]> => {
    const tMatch = traceStart('Resolve all scheme codes', 'match', `${holdings.length} holdings`);
    const results = await Promise.allSettled(
      holdings.map(h => resolveSchemeCode(h.amfiCode, h.schemeName))
    );
    const resolved = results.map(r => r.status === 'fulfilled' ? r.value : null);
    const matchedCount = resolved.filter(Boolean).length;
    traceEnd(tMatch, `${matchedCount}/${holdings.length} resolved`);
    return buildMatchResults(holdings, resolved);
  }, []);

  const handleFileSelected = useCallback(async (file: File, password?: string) => {
    const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20MB
    if (file.size > MAX_PDF_SIZE) {
      setError('PDF file must be under 20MB.');
      return;
    }
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
      })()]);
    } catch (err: any) {
      console.error('[APP] handleFileSelected error:', err);
      setError(err?.message || 'Failed to parse CAS');
      setStatusMsg('');
    } finally {
      setIsLoading(false);
    }
  }, [matchHoldings]);

  const handleManualSubmit = useCallback(async (holdings: ParsedHolding[]) => {
    setIsLoading(true);
    setError(null);
    try {
      const matches = await matchHoldings(holdings);
      setMatchResults(matches);
    } catch (err: any) {
      setError(err?.message || 'Failed to match schemes');
    } finally {
      setIsLoading(false);
    }
  }, [matchHoldings]);

  const handleDemo = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let matches: SchemeMatchResult[];
      try {
        matches = await matchHoldings(DEMO_HOLDINGS);
      } catch {
        matches = getDemoMatchResults();
      }
      setMatchResults(matches);
    } catch (err: any) {
      setError(err?.message || 'Demo failed');
    } finally {
      setIsLoading(false);
    }
  }, [matchHoldings]);

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

  const handleSkip = useCallback((index: number) => {
    setMatchResults(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], status: 'unmatched', needsConfirmation: false };
      return updated;
    });
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setIsLoading(false);
    setNeedsPassword(false);
    setParseResult(null);
    setMatchResults([]);
    setStatusMsg('');
  }, []);

  return {
    isLoading,
    error,
    needsPassword,
    parseResult,
    matchResults,
    statusMsg,
    handleFileSelected,
    handleManualSubmit,
    handleDemo,
    handleUpdateMatch,
    handleSkip,
    reset,
  };
}
