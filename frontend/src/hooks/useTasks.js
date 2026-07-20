// frontend/src/hooks/useTasks.js
import { useQuery } from '@tanstack/react-query';
import { getTasks } from '../api/tasks';

export const useTasks = (date, includeOverdue, includeRecurring, isToday, enabled = true) => {
  return useQuery({
    queryKey: ['tasks', { date, includeOverdue, includeRecurring, isToday }],
    queryFn: () => getTasks(date, includeOverdue, includeRecurring, isToday),
    enabled: !!date && enabled,
    staleTime: 30_000,
  });
};
