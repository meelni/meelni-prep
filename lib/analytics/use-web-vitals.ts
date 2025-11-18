/**
 * Web Vitals Performance Tracking Hook
 * Tracks Core Web Vitals (LCP, FID, CLS, TTFB, FCP) for performance monitoring
 */

'use client'

import { useEffect } from 'react'
import { analytics } from './analytics-service'

export function useWebVitals(pageName: string) {
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return

    const vitalsUrl = 'https://unpkg.com/web-vitals@3/dist/web-vitals.iife.js'

    // Load web-vitals library dynamically
    const script = document.createElement('script')
    script.src = vitalsUrl
    script.async = true

    script.onload = () => {
      if (window.webVitals) {
        const { onLCP, onFID, onCLS, onTTFB, onFCP } = window.webVitals

        const vitalsData: {
          lcp?: number
          fid?: number
          cls?: number
          ttfb?: number
          fcp?: number
        } = {}

        let reportedMetricsCount = 0
        const totalMetrics = 5 // LCP, FID, CLS, TTFB, FCP

        // Track when all metrics are collected
        const maybeReport = () => {
          reportedMetricsCount++

          // Report when we have all metrics, or after 10s timeout
          if (reportedMetricsCount >= totalMetrics) {
            reportVitals()
          }
        }

        const reportVitals = () => {
          analytics.track('page_performance', {
            page: pageName,
            ...vitalsData,
          })
        }

        // Set timeout to report after 10s even if not all metrics available
        setTimeout(() => {
          if (reportedMetricsCount > 0 && reportedMetricsCount < totalMetrics) {
            reportVitals()
          }
        }, 10000)

        // Track Largest Contentful Paint (LCP)
        // Good: < 2.5s, Needs Improvement: 2.5-4s, Poor: > 4s
        onLCP((metric) => {
          vitalsData.lcp = Math.round(metric.value)
          maybeReport()
        })

        // Track First Input Delay (FID)
        // Good: < 100ms, Needs Improvement: 100-300ms, Poor: > 300ms
        onFID((metric) => {
          vitalsData.fid = Math.round(metric.value)
          maybeReport()
        })

        // Track Cumulative Layout Shift (CLS)
        // Good: < 0.1, Needs Improvement: 0.1-0.25, Poor: > 0.25
        onCLS((metric) => {
          vitalsData.cls = Math.round(metric.value * 1000) / 1000 // Round to 3 decimals
          maybeReport()
        })

        // Track Time to First Byte (TTFB)
        // Good: < 800ms, Needs Improvement: 800-1800ms, Poor: > 1800ms
        onTTFB((metric) => {
          vitalsData.ttfb = Math.round(metric.value)
          maybeReport()
        })

        // Track First Contentful Paint (FCP)
        // Good: < 1.8s, Needs Improvement: 1.8-3s, Poor: > 3s
        onFCP((metric) => {
          vitalsData.fcp = Math.round(metric.value)
          maybeReport()
        })
      }
    }

    document.head.appendChild(script)

    // Cleanup
    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
  }, [pageName])
}

// TypeScript declarations for web-vitals library
declare global {
  interface Window {
    webVitals?: {
      onLCP: (callback: (metric: { value: number }) => void) => void
      onFID: (callback: (metric: { value: number }) => void) => void
      onCLS: (callback: (metric: { value: number }) => void) => void
      onTTFB: (callback: (metric: { value: number }) => void) => void
      onFCP: (callback: (metric: { value: number }) => void) => void
    }
  }
}
