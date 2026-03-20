// frontend/src/api/tasks.js
import axios from './axiosInstance';

export const getTasks = async (date, includeOverdue, includeRecurring, isToday) => {
  const params = new URLSearchParams(
    isToday
      ? {
          view: 'today',
          date,
          includeOverdue: includeOverdue ? '1' : '0',
          includeRecurring: includeRecurring ? '1' : '0',
        }
      : { view: 'date', date }
  );
  // We don't need to pass auth headers here if the axiosInstance is configured with an interceptor
  const { data } = await axios.get(`/api/tasks?${params.toString()}`);
  return data;
};