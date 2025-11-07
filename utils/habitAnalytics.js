// utils/habitAnalytics.js
// Habit tracking analytics utilities

/**
 * Calculate current streak for a habit
 * Returns the number of consecutive days (from today backwards) the habit was completed
 */
export function calculateCurrentStreak(history) {
  if (!history || history.length === 0) return 0;

  // Sort dates in descending order
  const sortedDates = [...history]
    .map(d => new Date(d))
    .sort((a, b) => b - a);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  let checkDate = new Date(today);

  for (const completionDate of sortedDates) {
    completionDate.setHours(0, 0, 0, 0);

    // Check if this date matches our expected date
    if (completionDate.getTime() === checkDate.getTime()) {
      streak++;
      // Move back one day
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (completionDate < checkDate) {
      // Found a gap in the streak
      break;
    }
  }

  return streak;
}

/**
 * Calculate longest streak ever for a habit
 */
export function calculateLongestStreak(history) {
  if (!history || history.length === 0) return 0;

  // Sort dates in ascending order
  const sortedDates = [...new Set(history)]
    .map(d => new Date(d))
    .sort((a, b) => a - b);

  let longestStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = sortedDates[i - 1];
    const currDate = sortedDates[i];

    // Calculate day difference
    const dayDiff = Math.floor((currDate - prevDate) / (1000 * 60 * 60 * 24));

    if (dayDiff === 1) {
      // Consecutive day
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      // Gap found, reset current streak
      currentStreak = 1;
    }
  }

  return longestStreak;
}

/**
 * Calculate completion rate for a habit over the last N days
 */
export function calculateCompletionRate(history, days = 30) {
  if (!history || history.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days + 1);

  // Count completed days in the period
  const completedDays = history.filter(dateStr => {
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    return date >= startDate && date <= today;
  }).length;

  return Math.round((completedDays / days) * 100);
}

/**
 * Get completion calendar data for visualization
 * Returns array of { date, completed } for the last N days
 */
export function getCompletionCalendar(history, days = 90) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const calendar = [];
  const historySet = new Set(history.map(d => {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date.toISOString().split('T')[0];
  }));

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    calendar.push({
      date: dateStr,
      completed: historySet.has(dateStr)
    });
  }

  return calendar;
}

/**
 * Calculate total completions
 */
export function getTotalCompletions(history) {
  return history ? history.length : 0;
}

/**
 * Get completion stats for this week
 */
export function getWeekStats(history) {
  if (!history || history.length === 0) {
    return { completed: 0, total: 7, rate: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday

  const completedThisWeek = history.filter(dateStr => {
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    return date >= startOfWeek && date <= today;
  }).length;

  const daysInWeek = today.getDay() + 1; // Sunday = 0, so add 1

  return {
    completed: completedThisWeek,
    total: daysInWeek,
    rate: Math.round((completedThisWeek / daysInWeek) * 100)
  };
}

/**
 * Get completion stats for this month
 */
export function getMonthStats(history) {
  if (!history || history.length === 0) {
    return { completed: 0, total: 0, rate: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const completedThisMonth = history.filter(dateStr => {
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    return date >= startOfMonth && date <= today;
  }).length;

  const daysInMonth = today.getDate();

  return {
    completed: completedThisMonth,
    total: daysInMonth,
    rate: Math.round((completedThisMonth / daysInMonth) * 100)
  };
}

/**
 * Calculate comprehensive analytics for a habit
 */
export function calculateHabitAnalytics(habit) {
  const history = habit.history || [];

  return {
    id: habit._id,
    title: habit.title,
    currentStreak: calculateCurrentStreak(history),
    longestStreak: calculateLongestStreak(history),
    totalCompletions: getTotalCompletions(history),
    completionRate30: calculateCompletionRate(history, 30),
    completionRate90: calculateCompletionRate(history, 90),
    weekStats: getWeekStats(history),
    monthStats: getMonthStats(history),
    calendar: getCompletionCalendar(history, 90)
  };
}
