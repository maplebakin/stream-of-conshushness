// frontend/src/pages/TrashPage.jsx
// Trash/Archive page for deleted tasks

import React, { useCallback, useEffect, useMemo, useState, useContext } from 'react';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';
import { useToast } from '../hooks/useToast.js';

export default function TrashPage() {
  const { token } = useContext(AuthContext);
  const { showToast } = useToast();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const fetchTrash = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/tasks/trash', { headers: authHeaders });
      setTasks(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch trash:', e);
      showToast('Failed to load trash items.', { type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, showToast]);

  useEffect(() => {
    if (token) {
      fetchTrash();
    }
  }, [fetchTrash, token]);

  async function handleRestore(taskId) {
    setRestoring(taskId);
    try {
      await axios.post(`/api/tasks/${taskId}/restore`, {}, { headers: authHeaders });
      showToast('Task restored successfully!', { type: 'success' });
      await fetchTrash();
    } catch (e) {
      console.error('Restore failed:', e);
      showToast('Failed to restore task.', { type: 'error' });
    } finally {
      setRestoring(null);
    }
  }

  async function handlePermanentDelete(taskId) {
    if (!window.confirm('Permanently delete this task? This cannot be undone.')) return;

    setDeleting(taskId);
    try {
      await axios.delete(`/api/tasks/${taskId}/permanent`, { headers: authHeaders });
      showToast('Task permanently deleted.', { type: 'info' });
      await fetchTrash();
    } catch (e) {
      console.error('Permanent delete failed:', e);
      showToast('Failed to delete task.', { type: 'error' });
    } finally {
      setDeleting(null);
    }
  }

  async function handleEmptyTrash() {
    if (!window.confirm('Permanently delete ALL items in trash? This cannot be undone.')) return;

    setLoading(true);
    try {
      const { data } = await axios.post('/api/tasks/trash/empty', {}, { headers: authHeaders });
      showToast(`Permanently deleted ${data.deletedCount} task(s).`, { type: 'info' });
      await fetchTrash();
    } catch (e) {
      console.error('Empty trash failed:', e);
      showToast('Failed to empty trash.', { type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }

  return (
    <main className="app-main" style={{ padding: 24 }}>
      <section className="section">
        <header className="section-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20
        }}>
          <div>
            <h2 className="font-glow" style={{ marginBottom: 8 }}>Trash</h2>
            <div className="muted">Deleted tasks are kept for 30 days before permanent deletion.</div>
          </div>
          {tasks.length > 0 && (
            <button
              className="btn"
              onClick={handleEmptyTrash}
              disabled={loading}
              style={{ background: 'var(--status-error, #dc2626)', color: 'white' }}
            >
              Empty Trash
            </button>
          )}
        </header>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading trash...
          </div>
        ) : tasks.length === 0 ? (
          <div style={{
            padding: 48,
            textAlign: 'center',
            background: 'var(--bg-secondary)',
            borderRadius: 12,
            border: '1px solid var(--border-primary)'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>🗑️</div>
            <div style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: 8 }}>
              Trash is empty
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              Deleted tasks will appear here.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tasks.map(task => (
              <div
                key={task._id}
                style={{
                  padding: 16,
                  background: 'var(--bg-secondary)',
                  borderRadius: 8,
                  border: '1px solid var(--border-primary)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 16
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '1rem',
                    color: 'var(--text-primary)',
                    marginBottom: 4,
                    textDecoration: task.completed ? 'line-through' : 'none',
                    opacity: 0.7
                  }}>
                    {task.title}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Deleted {formatDate(task.deletedAt)}
                    {task.dueDate && ` • Due: ${task.dueDate}`}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn"
                    onClick={() => handleRestore(task._id)}
                    disabled={restoring === task._id || deleting === task._id}
                    style={{ background: 'var(--status-success, #22c55e)', color: 'white' }}
                  >
                    {restoring === task._id ? 'Restoring...' : 'Restore'}
                  </button>
                  <button
                    className="btn"
                    onClick={() => handlePermanentDelete(task._id)}
                    disabled={restoring === task._id || deleting === task._id}
                    style={{ background: 'var(--status-error, #dc2626)', color: 'white' }}
                  >
                    {deleting === task._id ? 'Deleting...' : 'Delete Forever'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{
          marginTop: 24,
          padding: 16,
          background: 'var(--bg-secondary)',
          borderRadius: 8,
          border: '1px solid var(--border-primary)',
          fontSize: '0.9rem',
          color: 'var(--text-secondary)'
        }}>
          <strong>Note:</strong> Tasks in the trash can be restored or permanently deleted.
          Items are automatically purged after 30 days (feature coming soon).
        </div>
      </section>
    </main>
  );
}
