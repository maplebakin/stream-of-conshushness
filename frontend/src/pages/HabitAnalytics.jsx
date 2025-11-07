// frontend/src/pages/HabitAnalytics.jsx
// Habit tracking analytics and visualization

import React, { useState, useEffect } from 'react';
import axiosInstance from '../api/axiosInstance';
import toast from 'react-hot-toast';
import '../base.css';

export default function HabitAnalytics() {
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get('/habits/analytics');
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      toast.error('Failed to load habit analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="card">
          <p>Loading habit analytics...</p>
        </div>
      </div>
    );
  }

  if (analytics.length === 0) {
    return (
      <div className="page">
        <h1 style={{ marginBottom: '1rem' }}>Habit Analytics</h1>
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>No habits yet</p>
          <p style={{ color: 'var(--text-secondary)' }}>
            Create some habits to see your analytics and track your progress!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ marginBottom: '1.5rem' }}>Habit Analytics</h1>

        {/* Summary Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <StatCard
            label="Active Habits"
            value={analytics.length}
            color="#9b87f5"
          />
          <StatCard
            label="Total Completions"
            value={analytics.reduce((sum, h) => sum + h.totalCompletions, 0)}
            color="#10B981"
          />
          <StatCard
            label="Longest Streak"
            value={Math.max(...analytics.map(h => h.longestStreak), 0) + ' days'}
            color="#F59E0B"
          />
          <StatCard
            label="Active Streaks"
            value={analytics.filter(h => h.currentStreak > 0).length}
            color="#0EA5E9"
          />
        </div>

        {/* Individual Habit Analytics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {analytics.map((habit) => (
            <HabitAnalyticsCard key={habit.id} habit={habit} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="card" style={{ textAlign: 'center', borderTop: `4px solid ${color}` }}>
      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 700, color }}>
        {value}
      </div>
    </div>
  );
}

function HabitAnalyticsCard({ habit }) {
  return (
    <div className="card">
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>{habit.title}</h2>

      {/* Key Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <MetricBox label="Current Streak" value={habit.currentStreak} unit="days" highlight={habit.currentStreak > 0} />
        <MetricBox label="Longest Streak" value={habit.longestStreak} unit="days" />
        <MetricBox label="Total Completions" value={habit.totalCompletions} unit="times" />
        <MetricBox label="30-Day Rate" value={habit.completionRate30} unit="%" />
      </div>

      {/* Week & Month Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            This Week
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                {habit.weekStats.completed}/{habit.weekStats.total}
              </span>
              <span style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)' }}>days</span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: habit.weekStats.rate >= 70 ? '#10B981' : '#F59E0B' }}>
              {habit.weekStats.rate}%
            </div>
          </div>
        </div>

        <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            This Month
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                {habit.monthStats.completed}/{habit.monthStats.total}
              </span>
              <span style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)' }}>days</span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: habit.monthStats.rate >= 70 ? '#10B981' : '#F59E0B' }}>
              {habit.monthStats.rate}%
            </div>
          </div>
        </div>
      </div>

      {/* Completion Calendar */}
      <div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          Last 90 Days
        </div>
        <CompletionCalendar calendar={habit.calendar} />
      </div>
    </div>
  );
}

function MetricBox({ label, value, unit, highlight }) {
  return (
    <div style={{
      padding: '1rem',
      background: highlight ? '#10B981' : 'var(--bg-secondary)',
      color: highlight ? 'white' : 'var(--text-primary)',
      borderRadius: '8px'
    }}>
      <div style={{ fontSize: '0.75rem', opacity: highlight ? 0.9 : 0.7, marginBottom: '0.25rem' }}>
        {label}
      </div>
      <div>
        <span style={{ fontSize: '1.75rem', fontWeight: 700 }}>{value}</span>
        {unit && <span style={{ marginLeft: '0.25rem', fontSize: '0.875rem', opacity: 0.8 }}>{unit}</span>}
      </div>
    </div>
  );
}

function CompletionCalendar({ calendar }) {
  // Group calendar by weeks
  const weeks = [];
  for (let i = 0; i < calendar.length; i += 7) {
    weeks.push(calendar.slice(i, i + 7));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'auto' }}>
      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} style={{ display: 'flex', gap: '4px' }}>
          {week.map((day, dayIndex) => (
            <div
              key={dayIndex}
              title={`${day.date}: ${day.completed ? 'Completed' : 'Not completed'}`}
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '3px',
                background: day.completed ? '#10B981' : 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                cursor: 'pointer',
                transition: 'transform 0.1s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            />
          ))}
        </div>
      ))}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '12px', height: '12px', background: '#10B981', borderRadius: '2px' }} />
          <span>Completed</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '12px', height: '12px', background: 'var(--bg-tertiary)', borderRadius: '2px', border: '1px solid var(--border-primary)' }} />
          <span>Missed</span>
        </div>
      </div>
    </div>
  );
}
