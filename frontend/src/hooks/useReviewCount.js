import { useCallback, useEffect, useState } from 'react';
import { listReviewItems } from '../api/review.js';

export function useReviewCount(enabled = true, refreshKey = 0) {
  const [count, setCount] = useState(0);
  const [counts, setCounts] = useState({
    tasks: 0,
    ripples: 0,
    gather: 0,
    interests: 0,
    calendar: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      setCounts({ tasks: 0, ripples: 0, gather: 0, interests: 0, calendar: 0, total: 0 });
      setLoading(false);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await listReviewItems({ limit: 1 });
      const nextCounts = {
        tasks: Number(data.counts?.tasks) || 0,
        ripples: Number(data.counts?.ripples) || 0,
        gather: Number(data.counts?.gather) || 0,
        interests: Number(data.counts?.interests) || 0,
        calendar: Number(data.counts?.calendar) || 0,
        total: Number(data.counts?.total) || 0,
      };
      setCounts(nextCounts);
      setCount(nextCounts.total);
    } catch (err) {
      console.error('[useReviewCount] load failed:', err?.response?.data || err.message);
      setCount(0);
      setCounts({ tasks: 0, ripples: 0, gather: 0, interests: 0, calendar: 0, total: 0 });
      setError(err?.response?.data?.error || 'Could not load review count.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  return { count, counts, loading, error, refresh };
}
