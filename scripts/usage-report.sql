-- Monthly Usage Report
-- Run this at the end of each month to monitor usage patterns

-- Overall usage distribution
SELECT 
  tier,
  COUNT(DISTINCT user_id) as users,
  AVG(interview_count) as avg_interviews,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY interview_count) as p50,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY interview_count) as p90,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY interview_count) as p99,
  MAX(interview_count) as max_interviews
FROM (
  SELECT 
    u.subscription_tier as tier,
    s.user_id,
    COUNT(*) as interview_count
  FROM interview_session s
  JOIN app_user u ON s.user_id = u.id
  WHERE s.started_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
    AND s.started_at < DATE_TRUNC('month', CURRENT_DATE)
  GROUP BY u.subscription_tier, s.user_id
) usage
GROUP BY tier;

-- Power users (>50 interviews/month)
SELECT 
  u.id,
  u.email,
  u.subscription_tier,
  COUNT(*) as interview_count,
  COUNT(*) * 0.39 as estimated_cost,
  CASE 
    WHEN u.subscription_tier = 'pro' THEN 29
    WHEN u.subscription_tier = 'premium' THEN 79
    ELSE 0 
  END as revenue,
  (CASE 
    WHEN u.subscription_tier = 'pro' THEN 29
    WHEN u.subscription_tier = 'premium' THEN 79
    ELSE 0 
  END) - (COUNT(*) * 0.39) as profit
FROM interview_session s
JOIN app_user u ON s.user_id = u.id
WHERE s.started_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
  AND s.started_at < DATE_TRUNC('month', CURRENT_DATE)
GROUP BY u.id, u.email, u.subscription_tier
HAVING COUNT(*) > 50
ORDER BY interview_count DESC;

-- Cost summary
SELECT 
  DATE_TRUNC('month', started_at) as month,
  COUNT(*) as total_interviews,
  COUNT(*) * 0.39 as estimated_ai_cost,
  COUNT(DISTINCT user_id) as active_users,
  COUNT(*) * 1.0 / NULLIF(COUNT(DISTINCT user_id), 0) as avg_per_user
FROM interview_session
WHERE started_at >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', started_at)
ORDER BY month DESC;
