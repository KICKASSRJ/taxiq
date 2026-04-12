/**
 * Fuzzy string matching for scheme name matching.
 * Matches CAS scheme names (which may be abbreviated/formatted differently)
 * against MFapi.in scheme names.
 */

/** Normalize a scheme name for comparison */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')     // Remove parenthetical content
    .replace(/\b(the|of|and|in|for|a|an)\b/g, ' ')
    .replace(/[-_&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokenize a normalized name into significant words */
function tokenize(name: string): string[] {
  return normalize(name)
    .split(' ')
    .filter(w => w.length > 1);
}

/** Calculate Jaccard similarity between two token sets */
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/** Check if tokens of a are largely contained in b (asymmetric) */
function containmentScore(query: string[], candidate: string[]): number {
  const candidateSet = new Set(candidate);
  const matched = query.filter(t => candidateSet.has(t));
  return query.length === 0 ? 0 : matched.length / query.length;
}

/** Simple Levenshtein-based similarity for short strings */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

function stringSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 0;
  return 1 - levenshteinDistance(na, nb) / maxLen;
}

export interface FuzzyMatchResult {
  name: string;
  code: number;
  confidence: number;
}

/**
 * Find best matches for a CAS scheme name from a list of MFapi.in schemes.
 * Returns top matches sorted by confidence.
 */
export function fuzzyMatchScheme(
  casName: string,
  candidates: { schemeName: string; schemeCode: number }[],
  topN = 5
): FuzzyMatchResult[] {
  const queryTokens = tokenize(casName);
  const queryNorm = normalize(casName);

  const scored = candidates.map(c => {
    const candTokens = tokenize(c.schemeName);
    const candNorm = normalize(c.schemeName);

    // Combine multiple similarity signals
    const jaccard = jaccardSimilarity(queryTokens, candTokens);
    const containment = containmentScore(queryTokens, candTokens);
    const strSim = stringSimilarity(queryNorm, candNorm);

    // Weighted combination
    const confidence = jaccard * 0.35 + containment * 0.4 + strSim * 0.25;

    return {
      name: c.schemeName,
      code: c.schemeCode,
      confidence: Math.round(confidence * 1000) / 1000,
    };
  });

  scored.sort((a, b) => b.confidence - a.confidence);
  return scored.slice(0, topN);
}
