// ── Two-sample mean-difference significance (Welch's t-test) ──────────────
// Single source of truth for the Supplements and Meal Sodium sections, which
// compare a group A mean against a group B mean (taken vs not-taken; high- vs
// low-sodium days). Replaces the old fixed ±3 mmHg cutoffs: a difference is
// only colored/announced if it clears statistical significance for the group
// sizes and spread actually observed.
//
// The Student-t tail (gammaln/betacf/betai) mirrors the validated correlation
// implementation in src/controllers/insights.js. It is reimplemented here
// rather than imported because the server (src/) and client (client/src/) are
// separate build roots — the Vite client bundle cannot import server-side
// modules — so cross-root sharing is not practical. Within the client this is
// the ONLY copy, and both cards route through this one function.

/* eslint-disable no-loss-of-precision -- standard Lanczos coefficients, copied
   verbatim from the validated backend implementation; trailing digits round to
   the nearest double (identical runtime value). */
function gammaln(xx) {
  const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let x = xx, y = xx
  let tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015
  for (let j = 0; j < 6; j++) { y += 1; ser += cof[j] / y }
  return -tmp + Math.log(2.5066282746310005 * ser / x)
}
/* eslint-enable no-loss-of-precision */

function betacf(a, b, x) {
  const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300
  const qab = a + b, qap = a + 1, qam = a - 1
  let c = 1, d = 1 - qab * x / qap
  if (Math.abs(d) < FPMIN) d = FPMIN
  d = 1 / d
  let h = d
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2))
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d; h *= d * c
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c; h *= del
    if (Math.abs(del - 1) < EPS) break
  }
  return h
}

function betai(a, b, x) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(
    gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x)
  )
  return x < (a + 1) / (a + b + 2)
    ? bt * betacf(a, b, x) / a
    : 1 - bt * betacf(b, a, 1 - x) / b
}

// Two-tailed p-value for a Student-t statistic with df degrees of freedom
// (df may be fractional, as Welch's df is). Same tail used by the correlation
// significance test.
function studentTwoTailedP(t, df) {
  if (df <= 0) return 1
  return betai(0.5 * df, 0.5, df / (df + t * t))
}

// Welch's two-sample t-test (unequal variances), two-tailed at p < 0.05.
// Inputs are per-group n, mean, and sample variance (n-1 denominator).
//
// diff = meanA - meanB. dotClass convention (shared by both callers, which
// pass A = exposure group, B = baseline): a significant lower-BP difference
// (diff < 0) is green, a significant higher-BP difference (diff > 0) is red,
// and anything non-significant is gray.
//
// Returns { significant, diff, dotClass, t, df, p }.
export function meanDiffSignificance({ nA, meanA, varA, nB, meanB, varB }) {
  const diff = (typeof meanA === 'number' && typeof meanB === 'number')
    ? meanA - meanB
    : null

  const untestable =
    !(nA >= 2) || !(nB >= 2) ||
    varA == null || varB == null || varA <= 0 || varB <= 0 ||
    diff == null

  if (untestable) {
    return { significant: false, diff, dotClass: 'ins-dot--gray', t: null, df: null, p: null }
  }

  const sa = varA / nA
  const sb = varB / nB
  const se = Math.sqrt(sa + sb)
  const t = diff / se

  // Welch–Satterthwaite degrees of freedom (fractional, exact — not pooled).
  const df = (sa + sb) * (sa + sb) /
    ((sa * sa) / (nA - 1) + (sb * sb) / (nB - 1))

  const p = studentTwoTailedP(t, df)
  const significant = p < 0.05

  const dotClass = !significant ? 'ins-dot--gray'
    : diff < 0 ? 'ins-dot--green'
    : 'ins-dot--red'

  return { significant, diff, dotClass, t, df, p }
}
