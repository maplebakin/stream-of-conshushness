// frontend/src/pages/TrashPage.jsx
// Trash/Archive page for deleted tasks and entries

import React, { useCallback, useEffect, useMemo, useState, useContext } from 'react';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';
import { useToast } from '../hooks/useToast.js';
import { listTrashedEntries, restoreEntry } from '../api/entries.js';

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function entryPreview(entry) {
  const candidates = [
    entry?.title,
    entry?.text,
    entry?.content,
    entry?.html,
  ];

  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const label = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (label) return label.slice(0, 140);
  }

  return 'Untitled entry';
}

export default function TrashPage() {
  const { token } = useContext(AuthContext);
  const { showToast } = useToast();
  const [tasks, setTasks] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoringTaskId, setRestoringTaskId] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  const [restoringEntryId, setRestoringEntryId] = useState(null);
  const [confirmingTaskDeleteId, setConfirmingTaskDeleteId] = useState(null);
  const [confirmingEmptyTrash, setConfirmingEmptyTrash] = useState(false);

  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const fetchTrash = useCallback(async () => {
    setLoading(true);
    try {
      const [taskResult, entryResult] = await Promise.allSettled([
        axios.get('/api/tasks/trash', { headers: authHeaders }),
        listTrashedEntries(),
      ]);

      setTasks(taskResult.status === 'fulfilled' && Array.isArray(taskResult.value.data)
        ? taskResult.value.data
        : []);
      setEntries(entryResult.status === 'fulfilled' && Array.isArray(entryResult.value)
        ? entryResult.value
        : []);
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

  async function handleTaskRestore(taskId) {
    setConfirmingTaskDeleteId(null);
    setRestoringTaskId(taskId);
    try {
      await axios.post(`/api/tasks/${taskId}/restore`, {}, { headers: authHeaders });
      showToast('Task restored successfully!', { type: 'success' });
      await fetchTrash();
    } catch (e) {
      console.error('Restore failed:', e);
      showToast('Failed to restore task.', { type: 'error' });
    } finally {
      setRestoringTaskId(null);
    }
  }

  async function handleTaskPermanentDelete(taskId) {
    if (confirmingTaskDeleteId !== taskId) {
      setConfirmingTaskDeleteId(taskId);
      return;
    }

    setDeletingTaskId(taskId);
    try {
      await axios.delete(`/api/tasks/${taskId}/permanent`, { headers: authHeaders });
      showToast('Task permanently deleted.', { type: 'info' });
      setConfirmingTaskDeleteId(null);
      await fetchTrash();
    } catch (e) {
      console.error('Permanent delete failed:', e);
      showToast('Failed to delete task.', { type: 'error' });
    } finally {
      setDeletingTaskId(null);
    }
  }

  async function handleEmptyTrash() {
    if (!confirmingEmptyTrash) {
      setConfirmingEmptyTrash(true);
      return;
    }

    setLoading(true);
    try {
      const { data } = await axios.post('/api/tasks/trash/empty', {}, { headers: authHeaders });
      showToast(`Permanently deleted ${data.deletedCount} task(s).`, { type: 'info' });
      setConfirmingEmptyTrash(false);
      await fetchTrash();
    } catch (e) {
      console.error('Empty trash failed:', e);
      showToast('Failed to empty trash.', { type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function handleEntryRestore(entryId) {
    setConfirmingTaskDeleteId(null);
    setRestoringEntryId(entryId);
    try {
      await restoreEntry(entryId);
      showToast('Entry restored successfully!', { type: 'success' });
      await fetchTrash();
    } catch (e) {
      console.error('Entry restore failed:', e);
      showToast('Failed to restore entry.', { type: 'error' });
    } finally {
      setRestoringEntryId(null);
    }
  }

  function taskDeleteLabel(taskId) {
    if (deletingTaskId === taskId) return 'Deleting...';
    if (confirmingTaskDeleteId === taskId) return 'Confirm Delete';
    return 'Delete Forever';
  }

  const hasAnyTrash = tasks.length > 0 || entries.length > 0;

  return (
    <main className="app-main" style={{ padding: 24 }}>
      <section className="section">
        <header className="section-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          gap: 12,
          flexWrap: 'wrap'
        }}>
          <div>
            <h2 className="font-glow" style={{ marginBottom: 8 }}>Trash</h2>
            <div className="muted">A holding place for things you moved out of the way. Entries can be restored for now.</div>
          </div>
          {tasks.length > 0 && (
            <button
              className="btn"
              onClick={handleEmptyTrash}
              disabled={loading}
              style={{ background: 'var(--status-error, #dc2626)', color: 'white' }}
            >
              {confirmingEmptyTrash ? 'Confirm Empty Trash' : 'Empty Task Trash'}
            </button>
          )}
          {confirmingEmptyTrash && (
            <button
              className="btn"
              type="button"
              onClick={() => setConfirmingEmptyTrash(false)}
              disabled={loading}
            >
              Cancel
            </button>
          )}
        </header>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading trash...
          </div>
        ) : !hasAnyTrash ? (
          <div className="review-empty" style={{
            padding: 48,
            textAlign: 'center',
            borderRadius: 'var(--radius-card)'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>🗑️</div>
            <div style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: 8 }}>
              Trash is empty
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              Deleted tasks and entries will appear here.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>Trashed Entries ({entries.length})</h3>
                {entries.length === 0 && <span className="muted">No trashed entries.</span>}
              </div>

              {entries.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {entries.map((entry) => (
                    <article
                      key={entry._id}
                      style={{
                        padding: 16,
                        background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 95%, white 5%), var(--color-surface))',
                        borderRadius: 'var(--radius-card)',
                        border: '1px solid color-mix(in srgb, var(--color-border) 76%, transparent)',
                        boxShadow: '0 8px 20px rgba(66, 45, 34, 0.06)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 16,
                        flexWrap: 'wrap'
                      }}
                    >
                      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                          Deleted {formatDate(entry.deletedAt)}
                          {entry.date && ` • Entry date ${entry.date}`}
                        </div>
                        <div style={{
                          fontSize: '1rem',
                          color: 'var(--text-primary)',
                          marginBottom: 6,
                          fontWeight: 600
                        }}>
                          {entryPreview(entry)}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                          {entry.text || entry.content || entry.html ? 'Trashed journal entry' : 'Trashed entry'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                        <button
                          className="btn"
                          onClick={() => handleEntryRestore(entry._id)}
                          disabled={restoringEntryId === entry._id}
                          style={{ background: 'var(--status-success, #22c55e)', color: 'white' }}
                        >
                          {restoringEntryId === entry._id ? 'Restoring...' : 'Restore'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-primary)' }}>
                  Deleted entries will appear here.
                </div>
              )}
            </section>

            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>Trashed Tasks ({tasks.length})</h3>
                {tasks.length === 0 && <span className="muted">No trashed tasks.</span>}
              </div>

              {tasks.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {tasks.map(task => (
                    <div
                      key={task._id}
                      style={{
                        padding: 16,
                        background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 95%, white 5%), var(--color-surface))',
                        borderRadius: 'var(--radius-card)',
                        border: '1px solid color-mix(in srgb, var(--color-border) 76%, transparent)',
                        boxShadow: '0 8px 20px rgba(66, 45, 34, 0.06)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 16,
                        flexWrap: 'wrap'
                      }}
                    >
                      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
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

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="btn"
                          onClick={() => handleTaskRestore(task._id)}
                          disabled={restoringTaskId === task._id || deletingTaskId === task._id}
                          style={{ background: 'var(--status-success, #22c55e)', color: 'white' }}
                        >
                          {restoringTaskId === task._id ? 'Restoring...' : 'Restore'}
                        </button>
                        <button
                          className="btn"
                          onClick={() => handleTaskPermanentDelete(task._id)}
                          disabled={restoringTaskId === task._id || deletingTaskId === task._id}
                          style={{ background: 'var(--status-error, #dc2626)', color: 'white' }}
                        >
                          {taskDeleteLabel(task._id)}
                        </button>
                        {confirmingTaskDeleteId === task._id && (
                          <button
                            className="btn"
                            type="button"
                            onClick={() => setConfirmingTaskDeleteId(null)}
                            disabled={deletingTaskId === task._id}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-primary)' }}>
                  Deleted tasks will appear here.
                </div>
              )}
            </section>
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
          Entries can be restored from trash, but permanent delete is still deferred.
        </div>
      </section>
    </main>
  );
}
