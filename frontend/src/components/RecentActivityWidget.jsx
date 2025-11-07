// frontend/src/components/RecentActivityWidget.jsx
// Dashboard widget showing recent activity summary

import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';
import { todayISOInToronto } from '../utils/date.js';

export default function RecentActivityWidget() {
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();
  const [data, setData] = useState({
    recentCompletions: [],
    upcomingTasks: [],
    todayTasksCount: 0,
    activeRipplesCount: 0,
    recentEntries: [],
    loading: true,
  });

  useEffect(() => {
    if (!token) return;

    async function fetchActivityData() {
      try {
        const today = todayISOInToronto();

        // Fetch recent completed tasks (last 5)
        const completedRes = await axios.get('/api/tasks?completed=true&limit=5', {
          headers: { Authorization: `Bearer ${token}` }
        });

        // Fetch upcoming tasks (next 5 incomplete)
        const upcomingRes = await axios.get('/api/tasks?completed=false&limit=5', {
          headers: { Authorization: `Bearer ${token}` }
        });

        // Fetch today's tasks count
        const todayRes = await axios.get(`/api/tasks/day/${today}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        // Fetch recent entries (last 3)
        const entriesRes = await axios.get('/api/entries?limit=3', {
          headers: { Authorization: `Bearer ${token}` }
        });

        // Count entries with suggested tasks (ripples)
        const allEntriesRes = await axios.get('/api/entries', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const entriesWithRipples = Array.isArray(allEntriesRes.data)
          ? allEntriesRes.data.filter(e => e.suggestedTasks && e.suggestedTasks.length > 0)
          : [];

        setData({
          recentCompletions: Array.isArray(completedRes.data) ? completedRes.data.slice(0, 5) : [],
          upcomingTasks: Array.isArray(upcomingRes.data) ? upcomingRes.data.slice(0, 5) : [],
          todayTasksCount: Array.isArray(todayRes.data) ? todayRes.data.filter(t => !t.completed).length : 0,
          activeRipplesCount: entriesWithRipples.length,
          recentEntries: Array.isArray(entriesRes.data) ? entriesRes.data.slice(0, 3) : [],
          loading: false,
        });
      } catch (error) {
        console.error('Failed to fetch activity data:', error);
        setData(prev => ({ ...prev, loading: false }));
      }
    }

    fetchActivityData();
  }, [token]);

  if (data.loading) {
    return (
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px',
        border: '1px solid var(--border-primary)'
      }}>
        <div style={{ color: 'var(--text-secondary)' }}>Loading activity...</div>
      </div>
    );
  }

  const StatCard = ({ label, value, icon, onClick }) => (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-primary)',
        borderRadius: '8px',
        padding: '16px',
        border: '1px solid var(--border-primary)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.background = 'var(--bg-secondary)';
          e.currentTarget.style.borderColor = 'var(--accent-primary)';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.background = 'var(--bg-primary)';
          e.currentTarget.style.borderColor = 'var(--border-primary)';
        }
      }}
    >
      <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '4px' }}>
        {value}
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        {label}
      </div>
    </div>
  );

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: '12px',
      padding: '24px',
      marginBottom: '24px',
      border: '1px solid var(--border-primary)'
    }}>
      <h2 style={{
        fontSize: '1.25rem',
        fontWeight: 600,
        marginBottom: '20px',
        color: 'var(--text-primary)'
      }}>
        Recent Activity
      </h2>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <StatCard
          icon="✅"
          value={data.recentCompletions.length}
          label="Completed Recently"
          onClick={() => navigate('/today')}
        />
        <StatCard
          icon="📋"
          value={data.todayTasksCount}
          label="Tasks Today"
          onClick={() => navigate('/today')}
        />
        <StatCard
          icon="💡"
          value={data.activeRipplesCount}
          label="Active Ripples"
          onClick={() => navigate('/ripples')}
        />
        <StatCard
          icon="📝"
          value={data.recentEntries.length}
          label="Recent Entries"
          onClick={() => navigate('/')}
        />
      </div>

      {/* Recent Completions */}
      {data.recentCompletions.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{
            fontSize: '0.95rem',
            fontWeight: 600,
            marginBottom: '12px',
            color: 'var(--text-secondary)'
          }}>
            Recently Completed
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.recentCompletions.slice(0, 3).map(task => (
              <div
                key={task._id}
                style={{
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-primary)',
                  textDecoration: 'line-through',
                  opacity: 0.7
                }}
              >
                ✓ {task.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Tasks */}
      {data.upcomingTasks.length > 0 && (
        <div>
          <h3 style={{
            fontSize: '0.95rem',
            fontWeight: 600,
            marginBottom: '12px',
            color: 'var(--text-secondary)'
          }}>
            Coming Up
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.upcomingTasks.slice(0, 3).map(task => (
              <div
                key={task._id}
                onClick={() => navigate('/today')}
                style={{
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-primary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                  e.currentTarget.style.borderColor = 'var(--accent-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-primary)';
                  e.currentTarget.style.borderColor = 'var(--border-primary)';
                }}
              >
                <span>◯</span>
                <span style={{ flex: 1 }}>{task.title}</span>
                {task.dueDate && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {task.dueDate}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {data.recentCompletions.length === 0 && data.upcomingTasks.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '32px',
          color: 'var(--text-secondary)',
          fontSize: '0.9rem'
        }}>
          No recent activity. Start by adding tasks or journal entries!
        </div>
      )}
    </div>
  );
}
