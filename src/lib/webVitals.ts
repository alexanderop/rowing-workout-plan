import type { Metric } from 'web-vitals'
import { onCLS, onINP, onLCP } from 'web-vitals'

/**
 * Core Web Vitals reporting seam.
 *
 * In development the metrics are logged to the console so regressions are
 * visible while working. In production this is where you would forward them
 * to your analytics endpoint — the starter deliberately ships no tracking.
 */
export function reportWebVitals(): void {
  const report = (metric: Metric): void => {
    if (import.meta.env.DEV) {
      console.debug(`[web-vitals] ${metric.name}: ${Math.round(metric.value)}`)
    }
  }

  onCLS(report)
  onINP(report)
  onLCP(report)
}
