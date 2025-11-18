/**
 * Usage tracking utilities for monitoring interview consumption
 * 
 * Use this to track:
 * - Interviews per user per billing cycle
 * - Cost per user (for margin analysis)
 * - Power user detection (>50 interviews/month)
 */

export interface UsageMetrics {
  userId: string;
  billingCycleStart: Date;
  billingCycleEnd: Date;
  interviewCount: number;
  estimatedCost: number; // $0.39 per interview
  tier: 'free' | 'pro' | 'premium';
}

export const COST_PER_INTERVIEW = 0.39;
export const POWER_USER_THRESHOLD = 50; // interviews/month
export const ABUSE_THRESHOLD = 100; // interviews/month

export async function getUserUsageForCycle(
  userId: string,
  cycleStart: Date,
  cycleEnd: Date
): Promise<UsageMetrics> {
  // TODO: Implement query to interview_session table
  // SELECT COUNT(*) FROM interview_session 
  // WHERE user_id = ? AND started_at BETWEEN ? AND ?
  
  throw new Error('Not implemented');
}

export function flagHighUsageUsers(metrics: UsageMetrics[]): {
  powerUsers: UsageMetrics[];
  potentialAbusers: UsageMetrics[];
} {
  return {
    powerUsers: metrics.filter(m => m.interviewCount >= POWER_USER_THRESHOLD),
    potentialAbusers: metrics.filter(m => m.interviewCount >= ABUSE_THRESHOLD),
  };
}

export function calculateBlendedMetrics(metrics: UsageMetrics[]): {
  avgInterviewsPerUser: number;
  avgCostPerUser: number;
  totalCost: number;
  p50: number;
  p90: number;
  p99: number;
} {
  const counts = metrics.map(m => m.interviewCount).sort((a, b) => a - b);
  
  return {
    avgInterviewsPerUser: counts.reduce((a, b) => a + b, 0) / counts.length,
    avgCostPerUser: metrics.reduce((sum, m) => sum + m.estimatedCost, 0) / metrics.length,
    totalCost: metrics.reduce((sum, m) => sum + m.estimatedCost, 0),
    p50: counts[Math.floor(counts.length * 0.5)] || 0,
    p90: counts[Math.floor(counts.length * 0.9)] || 0,
    p99: counts[Math.floor(counts.length * 0.99)] || 0,
  };
}
