// ── Correlation strength tiering ──────────────────────────────
// Single source of truth, shared by the Insights page and the Dashboard
// "Correlation Insights" card, so the two can't drift apart.
//
// Strength language and color are gated on statistical significance
// (significant_diastolic, computed by the /insights/full engine), NOT raw |r|.
// Non-significant correlations — and anything with fewer than 7 paired days or
// a null r — render gray with no adjective, so the UI never calls a
// relationship "strong" without the data to back it.
//
// Significance itself is determined server-side (critical-r test on n), so
// there are no client-side significance helpers to co-locate here; this module
// only translates the precomputed flag + |r| into presentation tiers.
//
// Returns: { significant, dotClass, adjective, badgeClass }
export function strengthTier(corr) {
  const r = corr?.r_diastolic ?? null
  const n = corr?.n ?? 0
  const significant = !!corr?.significant_diastolic

  if (!significant || n < 7 || r == null) {
    return { significant: false, dotClass: 'ins-dot--gray', adjective: null, badgeClass: 'ins-r--none' }
  }

  const abs = Math.abs(r)
  if (abs >= 0.50) return { significant: true, dotClass: 'ins-dot--green', adjective: 'strongly',   badgeClass: 'ins-r--strong' }
  if (abs >= 0.30) return { significant: true, dotClass: 'ins-dot--green', adjective: 'moderately', badgeClass: 'ins-r--moderate' }
  return            { significant: true, dotClass: 'ins-dot--amber', adjective: 'mildly',     badgeClass: 'ins-r--weak' }
}
