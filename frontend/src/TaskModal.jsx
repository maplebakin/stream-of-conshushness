import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from './AuthContext.jsx';
import { createTask, updateTask } from '../api/tasks.js';

const RRULE_PRESETS = [
  ['Every day', 'FREQ=DAILY'],
  ['Every other day', 'FREQ=DAILY;INTERVAL=2'],
  ['Weekdays', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
  ['Weekends', 'FREQ=WEEKLY;BYDAY=SA,SU'],
  ['Every Wednesday', 'FREQ=WEEKLY;BYDAY=WE'],
];

export default function TaskModal({
  task,                 // optional: if present -> edit
  onClose,
  onSaved,
  defaultDate = '',
  defaultCluster = ''
}) {
  const { token } = useContext(AuthContext);
  const isEdit = !!(task && task._id);

  const [title, setTitle] = useState(task?.title || '');
  const [dueDate, setDueDate] = useState(task?.dueDate || defaultDate || '');
  const [repeat, setRepeat] = useState(task?.repeat || '');
  const [priority, setPriority] = useState(task?.priority || 'low');
  const [clustersText, setClustersText] = useState(
    (task?.clusters || (defaultCluster ? [defaultCluster] : []))?.join(', ')
  );
  const [notes, setNotes] = useState(task?.notes || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    setTitle(task?.title || '');
    setDueDate(task?.dueDate || '');
    setRepeat(task?.repeat || '');
    setPriority(task?.priority || 'low');
    setClustersText((task?.clusters || []).join(', '));
    setNotes(task?.notes || '');
  }, [isEdit, task?._id]);

  function parseClusters(text) {
    return text
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
  }

  async function handleSave() {
    setErr('');
    if (!title.trim()) { setErr('Title required'); return; }
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        dueDate: dueDate || '',
        repeat: repeat || '',
        priority,
        clusters: parseClusters(clustersText),
        notes: notes || ''
      };
      const saved = isEdit
        ? await updateTask({ token, id: task._id, patch: body })
        : await createTask({ token, body });

      onSaved?.(saved);
      onClose?.();
    } catch (e) {
      setErr(e.message || 'Failed to save task');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3 style={{marginTop:0}}>{isEdit ? 'Edit Task' : 'New Task'}</h3>

        <label className="field">
          <span>Title</span>
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Do the thing" />
        </label>

        <div className="row" style={{display:'flex', gap:8}}>
          <label className="field" style={{flex:1}}>
            <span>Due date</span>
            <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} />
          </label>
          <label className="field" style={{flex:1}}>
            <span>Priority</span>
            <div style={{display:'flex', gap:6}}>
              {['low','medium','high'].map(p => (
                <button key={p}
                        type="button"
                        className={`chip ${priority===p?'chip-active':''}`}
                        onClick={()=>setPriority(p)}>
                  {p}
                </button>
              ))}
            </div>
          </label>
        </div>

        <label className="field">
          <span>Repeat (RRULE)</span>
          <input value={repeat} onChange={e=>setRepeat(e.target.value)} placeholder="FREQ=WEEKLY;BYDAY=WE" />
          <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:6}}>
            {RRULE_PRESETS.map(([label, rule]) => (
              <button key={rule} type="button" className="chip chip-ghost" onClick={()=>setRepeat(rule)}>
                {label}
              </button>
            ))}
          </div>
        </label>

        <label className="field">
          <span>Clusters (comma separated)</span>
          <input value={clustersText} onChange={e=>setClustersText(e.target.value)} placeholder="home, colton" />
        </label>

        <label className="field">
          <span>Notes</span>
          <textarea rows={4} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional details…" />
        </label>

        {err && <div style={{color:'crimson', marginTop:8}}>{err}</div>}

        <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:12}}>
          <button onClick={onClose} disabled={saving}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : (isEdit ? 'Save' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  );
}
