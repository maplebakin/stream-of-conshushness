import { useCallback, useEffect, useState } from 'react';
import { listReviewItems } from '../api/review.js';

export function useReviewCount(enabled = true, refreshKey = 0) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      setLoading(false);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await listReviewItems({ limit: 1 });
      setCount(Number(data.counts?.total) || 0);
    } catch (err) {
      console.error('[useReviewCount] load failed:', err?.response?.data || err.message);
      setCount(0);
      setError(err?.response?.data?.error || 'Could not load review count.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  return { count, loading, error, refresh };
}
