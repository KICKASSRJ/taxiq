import { useState, useCallback } from 'react';
import type { SchemeMatchResult, FbarReport, CASParseResult } from '../types';
import { generateFbarReport } from '../services/fbar-engine';
import { startTrace, endTrace } from '../utils/perf-trace';
import { saveActivity } from '../services/auth-service';

export function useFbarComputation() {
  const [report, setReport] = useState<FbarReport | null>(null);
  const [computeProgress, setComputeProgress] = useState({ done: 0, total: 0 });

  const handleConfirm = useCallback(async (
    results: SchemeMatchResult[],
    parseResult: CASParseResult | null,
    calendarYear: number,
  ): Promise<'report' | 'confirm-schemes'> => {
    const total = results.filter(m => m.status === 'matched' && m.selectedMatch).length;
    setComputeProgress({ done: 0, total });

    try {
      startTrace();
      const fbarReport = await generateFbarReport(
        results,
        parseResult?.investorName || '',
        parseResult?.pan || '',
        calendarYear,
        undefined,
        (done, t) => setComputeProgress({ done, total: t })
      );

      setReport(fbarReport);
      endTrace();

      saveActivity('fbar_report',
        `FBAR report for ${calendarYear} — ${fbarReport.funds.length} funds, peak $${fbarReport.totalPeakUSD.toLocaleString()}`,
        {
          year: calendarYear,
          fundsCount: fbarReport.funds.length,
          totalPeakUSD: fbarReport.totalPeakUSD,
          investor: parseResult?.investorName || '',
        }
      );

      return 'report';
    } catch {
      return 'confirm-schemes';
    }
  }, []);

  const reset = useCallback(() => {
    setReport(null);
    setComputeProgress({ done: 0, total: 0 });
  }, []);

  return { report, computeProgress, handleConfirm, reset };
}
