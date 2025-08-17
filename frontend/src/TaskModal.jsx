// src/TaskModal.jsx
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from './AuthContext.jsx';
import axios from './api/axiosInstance';

/* ───────────────────────── Helpers: Toronto-safe dates ───────────────────────── */
function todayISOInTZ(timeZone = 'America/Toronto') {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const [{ value: y }, , { value: m }, , { value: d }] = fmt.formatToParts(new Date());
  return `${y}-${m}-${d}`;
}

function addDays(iso, n) {
  const [Y, M, D] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(Y, M - 1, D));
  d.setUTCDate(d.getUTCDate() + n);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addWeeks(iso, n) {
  return addDays(iso, 7 * n);
}

function nextWeekdayFrom(todayISO, targetDow /* 0=Sun..6=Sat */) {
  const d = new Date(`${todayISO}T12:00:00Z`);
  const cur = d.getUTCDay();
  let delta = (targetDow - cur + 7) % 7;
  if (delta === 0) delta = 7; // "next Monday" means future, not today
  d.setUTCDate(d.getUTCDate() + delta);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DOW = { sunday:0, sun:0, monday:1, mon:1, tuesday:2, tue:2, tues:2, wednesday:3, wed:3, thursday:4, thu:4, thurs:4, friday:5, fri:5, saturday:6, sat:6 };
const BYDAY = { 0:'SU', 1:'MO', 2:'TU', 3:'WE', 4:'TH', 5:'FR', 6:'SA' };

/* ───────────────────────── Enhanced Journal Analysis ───────────────────────── */
function analyzeTaskIntent(text) {
  const definitiveMarkers = /\b(need to|have to|must|should|gonna|will|plan to)\s+([^,.!?]+)/gi;
  const aspirationalMarkers = /\b(want to|would like to|hope to|thinking about|considering)\s+([^,.!?]+)/gi;
  const pastTenseMarkers = /\b(\w+ed|was|were|did|went|had|finished|completed)\b/gi;
  const emotionalMarkers = /\b(felt|feeling|feel|thought|thinking|remember when|miss|love|hate)\b/gi;

  const definitiveMatches = [...text.matchAll(definitiveMarkers)];
  const aspirationalMatches = [...text.matchAll(aspirationalMarkers)];
  const pastTenseCount = (text.match(pastTenseMarkers) || []).length;
  const emotionalCount = (text.match(emotionalMarkers) || []).length;

  let confidence = 0;
  let type = 'reflection';
  let suggestedAction = 'ignore';

  if (definitiveMatches.length > 0) {
    confidence = Math.min(0.9, 0.5 + (definitiveMatches.length * 0.2));
    type = 'definitive';
    suggestedAction = confidence > 0.7 ? 'auto-add' : 'suggest';
  } else if (aspirationalMatches.length > 0) {
    confidence = Math.min(0.6, 0.3 + (aspirationalMatches.length * 0.15));
    type = 'aspirational';
    suggestedAction = 'suggest';
  }

  if (pastTenseCount > 2 || emotionalCount > 1) {
    confidence *= 0.5;
    if (confidence < 0.3) suggestedAction = 'ignore';
  }

  return {
    confidence,
    type,
    suggestedAction,
    definitiveActions: definitiveMatches.map(m => m[2].trim()),
    aspirationalActions: aspirationalMatches.map(m => m[2].trim())
  };
}

// Add “next week / in N weeks” awareness + journal-relative parsing
function extractContextualDate(text, journalDate, todayISO) {
  const journalDateISO = journalDate || todayISO;
  const journalDateObj = new Date(`${journalDateISO}T12:00:00Z`);
  const todayObj = new Date(`${todayISO}T12:00:00Z`);
  const isHistoricalJournal = journalDateObj < todayObj;

  // journal-relative tokens
  if (isHistoricalJournal) {
    if (/\btomorrow\b/i.test(text)) return addDays(journalDateISO, 1);

    const mNextWeek = text.match(/\bnext\s+week\b/i);
    if (mNextWeek) return addWeeks(journalDateISO, 1);

    const mInWeeks = text.match(/\bin\s+(\d+)\s+weeks?\b/i);
    if (mInWeeks) return addWeeks(journalDateISO, Number(mInWeeks[1] || '0'));

    const mNextDow = text.match(/\bnext\s+(sun|mon|tue|tues|wed|thu|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
    if (mNextDow) return nextWeekdayFrom(journalDateISO, DOW[mNextDow[1]]);
  }

  // fall back to standard
  return extractDateTokenFromText(text, todayISO);
}

function extractTaskRelationships(text) {
  const dependencies = [];
  const triggers = [];

  const afterPattern = /after\s+(?:I\s+)?(finish|complete|do)\s+([^,]+),?\s*(?:I\s+)?(need to|should|will|plan to)\s+(.+?)(?:[.!?]|$)/gi;
  let match;
  while ((match = afterPattern.exec(text)) !== null) {
    dependencies.push({
      type: 'after',
      prerequisite: match[2].trim(),
      action: match[4].trim()
    });
  }

  const beforePattern = /(?:before|prior to)\s+([^,]+),?\s*(?:remember to|need to|should|must|plan to)\s+(.+?)(?:[.!?]|$)/gi;
  while ((match = beforePattern.exec(text)) !== null) {
    triggers.push({
      type: 'before',
      trigger: match[1].trim(),
      action: match[2].trim()
    });
  }

  return { dependencies, triggers };
}

function inferTaskProperties(text) {
  const stressMarkers = /\b(stressed|worried|anxious|urgent|asap|panic|rush|deadline|overdue)\b/gi;
  const excitementMarkers = /\b(excited|can't wait|really want|love to|eager)\b/gi;
  const routineMarkers = /\b(daily|routine|habit|regular|always|usually)\b/gi;

  const stressCount = (text.match(stressMarkers) || []).length;
  const excitementCount = (text.match(excitementMarkers) || []).length;
  const routineCount = (text.match(routineMarkers) || []).length;

  let priority = 'normal';
  if (stressCount > 0) priority = 'high';
  else if (excitementCount > 0) priority = 'medium';

  const homeMarkers   = /\b(home|house|kitchen|bedroom|bathroom|garden|yard|cleaning|laundry)\b/gi;
  const workMarkers   = /\b(work|office|meeting|project|client|deadline|colleague|boss)\b/gi;
  const healthMarkers = /\b(doctor|dentist|gym|exercise|health|medicine|appointment)\b/gi;

  let suggestedCluster = '';
  if ((text.match(homeMarkers) || []).length > 0) suggestedCluster = 'Home';
  else if ((text.match(workMarkers) || []).length > 0) suggestedCluster = 'Work';
  else if ((text.match(healthMarkers) || []).length > 0) suggestedCluster = 'Health';

  return {
    suggestedPriority: priority,
    suggestedCluster,
    isRoutine: routineCount > 0,
    emotionalContext: { stress: stressCount, excitement: excitementCount }
  };
}

function shouldExtractAsTask(text) {
  if (/\b(felt|feeling|feel|thought|thinking|remember when|missed|loved|hated)\b/gi.test(text)) {
    const actionableWords = /\b(need to|should|must|have to|gonna|will|plan to)\b/gi;
    if (!(actionableWords.test(text))) {
      return { extract: false, reason: 'emotional_processing' };
    }
  }

  if (/\b(finished|completed|did|went|had)\b/gi.test(text) &&
      !/\b(need to|should|next time|again|remember to|plan to)\b/gi.test(text)) {
    return { extract: false, reason: 'past_action' };
  }

  if (/\b(need to|should|must|have to|gonna|will|plan to)\b/gi.test(text)) {
    return { extract: true, confidence: 0.9 };
  }

  if (/\b(should I|when should|how do I|what if I)\b/gi.test(text)) {
    return { extract: true, confidence: 0.6, reason: 'questioning' };
  }

  return { extract: true, confidence: 0.5 };
}

/* ───────────────────────── Original parsing functions (kept for compatibility) ───────────────────────── */
function parseAbsoluteOrKeywordDate(token, todayISO) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return token;
  const t = token.toLowerCase();
  if (t === 'today') return todayISO;
  if (t === 'tomorrow' || t === 'tmrw' || t === 'tmmrw') return addDays(todayISO, 1);
  if (t === 'yesterday') return addDays(todayISO, -1);

  // weeks
  if (t === 'next week') return addWeeks(todayISO, 1);
  const w1 = t.match(/^in\s+(\d+)\s+weeks?$/);
  if (w1) return addWeeks(todayISO, Number(w1[1] || '0'));

  const m1 = t.match(/^next\s+(sun|mon|tue|tues|wed|thu|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i);
  if (m1) return nextWeekdayFrom(todayISO, DOW[m1[1]]);

  const m2 = t.match(/^(sun|mon|tue|tues|wed|thu|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i);
  if (m2) {
    const target = DOW[m2[1]];
    const d = new Date(`${todayISO}T12:00:00Z`);
    if (d.getUTCDay() === target) return todayISO;
    return nextWeekdayFrom(todayISO, target);
  }

  const m3 = t.match(/^in\s+(\d+)\s+days?$/);
  if (m3) return addDays(todayISO, Number(m3[1] || '0'));

  const m4 = t.match(/^(\d+)\s+days?\s*(from\s*)?now$/);
  if (m4) return addDays(todayISO, Number(m4[1] || '0'));

  return '';
}

function parseRRuleFromText(text) {
  const s = text.toLowerCase();
  if (/\bweekdays?\b/.test(s)) return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  if (/\bweekends?\b/.test(s)) return 'FREQ=WEEKLY;BYDAY=SA,SU';

  let m = s.match(/\bevery\s+(\d+)\s+days?\b/);
  if (m) return `FREQ=DAILY;INTERVAL=${m[1]}`;

  if (/\bevery\s+other\s+day\b/.test(s)) return 'FREQ=DAILY;INTERVAL=2';

  m = s.match(/\bevery\s+((?:sun|mon|tue|tues|wed|thu|thurs|fri|sat)(?:\s*,\s*(?:sun|mon|tue|tues|wed|thu|thurs|fri|sat))*)\b/);
  if (m) {
    const days = m[1].split(/\s*,\s*/).map(d => BYDAY[DOW[d]]);
    if (days.length) return `FREQ=WEEKLY;BYDAY=${Array.from(new Set(days)).join(',')}`;
  }

  m = s.match(/\bevery\s+(sun|mon|tue|tues|wed|thu|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (m) return `FREQ=WEEKLY;BYDAY=${BYDAY[DOW[m[1]]]}`;

  if (/\bevery\s+month\b/.test(s) || /\bmonthly\b/.test(s)) {
    const mday = s.match(/\bon\s+the?\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (mday) {
      const n = Math.max(1, Math.min(31, Number(mday[1])));
      return `FREQ=MONTHLY;BYMONTHDAY=${n}`;
    }
    const mpos = s.match(/\bon\s+the?\s+(first|1st|second|2nd|third|3rd|fourth|4th|last)\s+(sun|mon|tue|tues|wed|thu|thurs|fri|sat)/);
    if (mpos) {
      const posMap = { first:1, '1st':1, second:2, '2nd':2, third:3, '3rd':3, fourth:4, '4th':4, last:-1 };
      const pos = posMap[mpos[1]];
      const day = BYDAY[DOW[mpos[2]]];
      if (pos === -1) return `FREQ=MONTHLY;BYDAY=${day};BYSETPOS=-1`;
      return `FREQ=MONTHLY;BYDAY=${day};BYSETPOS=${pos}`;
    }
    return 'FREQ=MONTHLY';
  }
  if (/\bevery\s+year\b/.test(s) || /\byearly\b/.test(s) || /\bannually\b/.test(s)) {
    return 'FREQ=YEARLY';
  }

  if (/\bevery\s+week\b/.test(s) || /\bweekly\b/.test(s)) {
    return 'FREQ=WEEKLY';
  }

  if (/\bevery\s+day\b/.test(s) || /\bdaily\b/.test(s)) {
    return 'FREQ=DAILY';
  }

  return '';
}

function extractClusterFromText(text) {
  let m = text.match(/#([A-Za-z0-9][\w-]{0,40})/);
  if (m) return m[1];

  m = text.match(/\bcluster:(\S+)/i);
  if (m) return m[1].replace(/[^\w-]/g, '');

  return '';
}

function extractDateTokenFromText(text, todayISO) {
  const atTok = text.match(/@([^\s]+)/);
  if (atTok) {
    const d = parseAbsoluteOrKeywordDate(atTok[1], todayISO);
    if (d) return d;
  }

  const candidates = ['today','tomorrow','tmrw','yesterday','next week', ...Object.keys(DOW)];
  for (const cand of candidates) {
    const rx = new RegExp(`\\b${cand.replace(' ', '\\s+')}\\b`, 'i');
    if (rx.test(text)) {
      const d = parseAbsoluteOrKeywordDate(cand, todayISO);
      if (d) return d;
    }
  }

  const m1 = text.match(/\bnext\s+(sun|mon|tue|tues|wed|thu|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (m1) return parseAbsoluteOrKeywordDate(`next ${m1[1]}`, todayISO);

  const mWeeks = text.match(/\bin\s+(\d+)\s+weeks?\b/i);
  if (mWeeks) return parseAbsoluteOrKeywordDate(`in ${mWeeks[1]} weeks`, todayISO);

  const m2 = text.match(/\bin\s+(\d+)\s+days?\b/i);
  if (m2) return parseAbsoluteOrKeywordDate(`in ${m2[1]} days`, todayISO);

  const m3 = text.match(/\b(\d+)\s+days?\s*(from\s*)?now\b/i);
  if (m3) return parseAbsoluteOrKeywordDate(`${m3[1]} days from now`, todayISO);

  const m4 = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (m4) return m4[1];

  return '';
}

function stripSyntaxFromTitle(raw) {
  let out = raw
    .replace(/@[^\s]+/g, '')
    .replace(/#\w[\w-]*/g, '')
    .replace(/\bcluster:\S+\b/gi, '')
    .replace(/\bevery\s+other\s+day\b/gi, '')
    .replace(/\bevery\s+\d+\s+days?\b/gi, '')
    .replace(/\bevery\s+(sun|mon|tue|tues|wed|thu|thurs|fri|sat)(\s*,\s*(sun|mon|tue|tues|wed|thu|thurs|fri|sat))*\b/gi, '')
    .replace(/\bevery\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, '')
    .replace(/\b(weekly|daily|monthly|yearly|annually)\b/gi, '')
    .replace(/\bevery\s+week\b/gi, '')
    .replace(/\bevery\s+day\b/gi, '')
    .replace(/\bevery\s+month\b/gi, '')
    .replace(/\bon\s+the?\s+\d+(st|nd|rd|th)?\b/gi, '')
    .replace(/\bon\s+the?\s+(first|second|third|fourth|last)\s+(sun|mon|tue|tues|wed|thu|thurs|fri|sat)\b/gi, '')
    .replace(/\b(next\s+(sun|mon|tue|tues|wed|thu|thurs|fri|sat)(?:day)?)\b/gi, '')
    .replace(/\b(today|tomorrow|tmrw|yesterday|next week)\b/gi, '');

  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

/* ───────────────────────── Journal Task Extraction ───────────────────────── */
function extractTasksFromJournal(journalText, journalDate, todayISO) {
  const sentences = journalText.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const extractedTasks = [];

  for (const sentence of sentences) {
    const taskAnalysis = shouldExtractAsTask(sentence);
    if (!taskAnalysis.extract) continue;

    const intent = analyzeTaskIntent(sentence);
    if (intent.confidence < 0.3) continue;

    const properties = inferTaskProperties(sentence);
    const relationships = extractTaskRelationships(sentence);

    const actions = [...intent.definitiveActions, ...intent.aspirationalActions];

    for (const action of actions) {
      if (!action || action.length < 3) continue;

      const inferredCluster = extractClusterFromText(sentence) || properties.suggestedCluster;
      const inferredDate = extractContextualDate(sentence, journalDate, todayISO);
      const inferredRRule = parseRRuleFromText(sentence);

      extractedTasks.push({
        title: action,
        originalSentence: sentence.trim(),
        confidence: intent.confidence,
        type: intent.type,
        suggestedAction: intent.suggestedAction,
        cluster: inferredCluster,
        dueDate: inferredDate,
        rrule: inferredRRule,
        priority: properties.suggestedPriority,
        relationships,
        emotionalContext: properties.emotionalContext,
        notes: `Extracted from journal: "${sentence.trim()}"`
      });
    }
  }

  return extractedTasks.sort((a, b) => b.confidence - a.confidence);
}

/* ───────────────────────── UI Components ───────────────────────── */
function TaskSuggestion({ task, onAccept, onModify, onReject }) {
  const confidenceColor = task.confidence > 0.7 ? '#22c55e' : task.confidence > 0.4 ? '#f59e0b' : '#ef4444';
  const confidenceText = task.confidence > 0.7 ? 'High' : task.confidence > 0.4 ? 'Medium' : 'Low';

  return (
    <div className="task-suggestion" style={{
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '8px',
      backgroundColor: task.suggestedAction === 'auto-add' ? '#f0fdf4' : '#ffffff'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '500', marginBottom: '4px' }}>
            {task.title}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '8px' }}>
            "{task.originalSentence}"
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <span style={{
              fontSize: '0.75rem',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: confidenceColor + '20',
              color: confidenceColor
            }}>
              {confidenceText} confidence ({Math.round(task.confidence * 100)}%)
            </span>
            <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#f3f4f6' }}>
              {task.type}
            </span>
            {task.cluster && (
              <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#ddd6fe' }}>
                #{task.cluster}
              </span>
            )}
            {task.dueDate && (
              <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#fef3c7' }}>
                Due: {task.dueDate}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="chip"
          onClick={() => onReject(task)}
          style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
        >
          Ignore
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => onModify(task)}
          style={{ backgroundColor: '#fef3c7', color: '#d97706' }}
        >
          Modify
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => onAccept(task)}
          style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}
        >
          Add Task
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── UI presets ───────────────────────── */
const RRULE_PRESETS = [
  ['Every day', 'FREQ=DAILY'],
  ['Every other day', 'FREQ=DAILY;INTERVAL=2'],
  ['Weekdays', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
  ['Weekends', 'FREQ=WEEKLY;BYDAY=SA,SU'],
  ['Every Wednesday', 'FREQ=WEEKLY;BYDAY=WE'],
  ['Monthly (same date)', 'FREQ=MONTHLY'],
];

/* ───────────────────────── Main Component ───────────────────────── */
export default function TaskModal({
  task,                 // optional existing task -> edit mode
  onClose,
  onSaved,
  defaultCluster = '',
  defaultDate = '',
  // New journal mode props
  journalMode = false,
  journalText = '',
  journalDate = ''
}) {
  const isEdit = !!task?._id;
  const { token } = useContext(AuthContext);
  const today = useMemo(() => todayISOInTZ(), []);

  // Journal analysis state
  const [extractedTasks, setExtractedTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);

  // Regular task state
  const [smart, setSmart] = useState('');
  const [title, setTitle] = useState(task?.title || '');
  const [notes, setNotes] = useState(task?.notes || '');
  const [cluster, setCluster] = useState(task?.cluster || defaultCluster);
  const [dueDate, setDueDate] = useState(task?.dueDate || defaultDate || '');
  const [rrule, setRRule] = useState(task?.rrule || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Extract tasks from journal on mount
  useEffect(() => {
    if (journalMode && journalText) {
      const tasks = extractTasksFromJournal(journalText, journalDate || today, today);
      setExtractedTasks(tasks);
    }
  }, [journalMode, journalText, journalDate, today]);

  // Parse smart input continuously (disabled when journal mode is on)
  useEffect(() => {
    if (!smart.trim() || journalMode) return;
    const inferredCluster = extractClusterFromText(smart) || cluster;
    const inferredDate    = extractDateTokenFromText(smart, today) || dueDate;
    const inferredRRule   = parseRRuleFromText(smart) || rrule;
    const inferredTitle   = stripSyntaxFromTitle(smart);

    if (!task?._id && (!title || title === stripSyntaxFromTitle(title))) {
      setTitle(inferredTitle || title);
    }
    if (inferredCluster && inferredCluster !== cluster) setCluster(inferredCluster);
    if (inferredDate && inferredDate !== dueDate) setDueDate(inferredDate);
    if (inferredRRule && inferredRRule !== rrule) setRRule(inferredRRule);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smart]);

  useEffect(() => setErr(''), [title, dueDate, rrule, cluster, smart]);

  async function handleSave() {
    const body = {
      title: (title || '').trim() || stripSyntaxFromTitle(smart),
      notes: (notes || '').trim(),
      cluster: cluster || '',
      dueDate: dueDate || '',
      rrule: rrule || ''
    };
    if (!body.title) {
      setErr('Please add a title.');
      return;
    }

    setSaving(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      if (isEdit) {
        await axios.patch(`/api/tasks/${task._id}`, body, { headers });
      } else {
        await axios.post('/api/tasks', body, { headers });
      }
      onSaved?.();
      onClose?.();
    } catch (e) {
      console.error('Task save failed', e);
      setErr('Could not save task.');
    } finally {
      setSaving(false);
    }
  }

  function acceptSuggestion(kind, value) {
    if (kind === 'date') setDueDate(value);
    if (kind === 'cluster') setCluster(value);
    if (kind === 'rrule') setRRule(value);
  }

  // Journal mode handlers
  function acceptTask(extractedTask) {
    setTitle(extractedTask.title);
    setNotes(extractedTask.notes || '');
    setCluster(extractedTask.cluster || '');
    setDueDate(extractedTask.dueDate || '');
    setRRule(extractedTask.rrule || '');
    setSelectedTask(extractedTask);
  }

  function modifyTask(extractedTask) {
    setTitle(extractedTask.title);
    setNotes(extractedTask.notes || '');
    setCluster(extractedTask.cluster || '');
    setDueDate(extractedTask.dueDate || '');
    setRRule(extractedTask.rrule || '');
    setSelectedTask(extractedTask);
  }

  function rejectTask(extractedTask) {
    setExtractedTasks(prev => prev.filter(t => t !== extractedTask));
  }

  // Derived "smart parse" preview (original functionality)
  const smartPreview = useMemo(() => {
    if (journalMode) return { iCluster: '', iDate: '', iRRule: '' };
    const iCluster = extractClusterFromText(smart) || '';
    const iDate    = extractDateTokenFromText(smart, today) || '';
    const iRRule   = parseRRuleFromText(smart) || '';
    return { iCluster, iDate, iRRule };
  }, [smart, today, journalMode]);

  // Journal Analysis Mode
  if (journalMode) {
    return (
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !saving && onClose?.()}>
        <div className="modal-card" style={{ maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }}>
          <div className="modal-header">
            <h3>Journal Task Analysis</h3>
            <div className="muted" style={{fontSize:'0.85rem'}}>
              AI extracted {extractedTasks.length} potential task{extractedTasks.length !== 1 ? 's' : ''} from your journal entry
            </div>
          </div>

          {/* Journal preview */}
          <div className="journal-preview" style={{
            backgroundColor: '#f9fafb',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '20px',
            maxHeight: '200px',
            overflow: 'auto'
          }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#6b7280' }}>
              Journal Entry {journalDate && `(${journalDate})`}
            </h4>
            <div style={{ fontSize: '0.9rem', lineHeight: '1.5', color: '#374151' }}>
              {journalText}
            </div>
          </div>

          {/* Extracted tasks */}
          {extractedTasks.length > 0 ? (
            <div className="extracted-tasks">
              <h4 style={{ marginBottom: '12px' }}>Potential Tasks</h4>
              {extractedTasks.map((extractedTask, i) => (
                <TaskSuggestion
                  key={i}
                  task={extractedTask}
                  onAccept={() => acceptTask(extractedTask)}
                  onModify={() => modifyTask(extractedTask)}
                  onReject={() => rejectTask(extractedTask)}
                />
              ))}
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              color: '#6b7280',
              backgroundColor: '#f9fafb',
              borderRadius: '8px'
            }}>
              <p>No actionable tasks detected in this journal entry.</p>
              <p style={{ fontSize: '0.85rem' }}>
                The AI looks for phrases like "need to", "should", "must", etc.
              </p>
            </div>
          )}

          {/* Task creation form (shown when a task is selected for modification) */}
          {selectedTask && (
            <div style={{
              marginTop: '24px',
              padding: '20px',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              backgroundColor: '#ffffff'
            }}>
              <h4 style={{ marginBottom: '16px' }}>Create/Modify Task</h4>

              <label className="field">
                <span>Title</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs doing?"
                />
              </label>

              <label className="field">
                <span>Notes</span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional details"
                />
              </label>

              <div className="field-grid">
                <label className="field">
                  <span>Cluster</span>
                  <input
                    type="text"
                    value={cluster}
                    onChange={(e) => setCluster(e.target.value)}
                    placeholder="e.g., Home, Work"
                  />
                </label>

                <label className="field">
                  <span>Due date</span>
                  <div style={{display:'flex', gap:8}}>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                    <div className="chip-row" style={{display:'flex', gap:6}}>
                      <button type="button" className="chip" onClick={()=> setDueDate(today)}>Today</button>
                      <button type="button" className="chip" onClick={()=> setDueDate(addDays(today, 1))}>Tomorrow</button>
                      <button type="button" className="chip" onClick={()=> setDueDate('')}>No date</button>
                    </div>
                  </div>
                </label>
              </div>

              <label className="field">
                <span>Repeat</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {RRULE_PRESETS.map(([label, value]) => (
                    <button
                      key={value}
                      type="button"
                      className={rrule === value ? 'chip active' : 'chip'}
                      onClick={() => setRRule(rrule === value ? '' : value)}
                      title={value}
                    >
                      {label}
                    </button>
                  ))}
                  <input
                    type="text"
                    value={rrule}
                    onChange={(e) => setRRule(e.target.value)}
                    placeholder="Custom RRULE (optional)"
                    style={{ flex: 1, minWidth: 160 }}
                  />
                </div>
              </label>

              {err && <div className="error">{err}</div>}

              <div className="modal-actions" style={{ marginTop: '16px' }}>
                <button onClick={() => setSelectedTask(null)} disabled={saving}>Cancel</button>
                <button onClick={handleSave} disabled={saving || !title.trim()}>
                  {saving ? 'Saving…' : 'Create Task'}
                </button>
              </div>
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: '24px' }}>
            <button onClick={onClose} disabled={saving}>
              {selectedTask ? 'Close' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Regular Task Modal (original functionality)
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !saving && onClose?.()}>
      <div className="modal-card" onKeyDown={(e)=> { if (e.key === 'Escape' && !saving) onClose?.(); }}>
        <div className="modal-header">
          <h3>{isEdit ? 'Edit Task' : 'New Task'}</h3>
          <div className="muted" style={{fontSize:'0.85rem'}}>
            Tip: Type anything, e.g. <code>Clean tank every other day #Home @tomorrow</code>
          </div>
        </div>

        {/* Smart composer */}
        <label className="field">
          <span>Smart input</span>
          <input
            type="text"
            value={smart}
            onChange={(e) => setSmart(e.target.value)}
            placeholder="e.g., Buy oats #Groceries next Fri every week @2025-08-21"
          />
          {(smartPreview.iCluster || smartPreview.iDate || smartPreview.iRRule) && (
            <div className="chips" style={{marginTop:8, display:'flex', gap:8, flexWrap:'wrap'}}>
              {smartPreview.iCluster && (
                <button type="button" className="chip" onClick={()=> acceptSuggestion('cluster', smartPreview.iCluster)}>
                  Cluster: {smartPreview.iCluster}
                </button>
              )}
              {smartPreview.iDate && (
                <button type="button" className="chip" onClick={()=> acceptSuggestion('date', smartPreview.iDate)}>
                  Date: {smartPreview.iDate}
                </button>
              )}
              {smartPreview.iRRule && (
                <button type="button" className="chip" onClick={()=> acceptSuggestion('rrule', smartPreview.iRRule)}>
                  Repeat: {smartPreview.iRRule}
                </button>
              )}
              <button
                type="button"
                className="chip"
                onClick={() => { setSmart(stripSyntaxFromTitle(smart)); }}
              >
                Clear syntax from title
              </button>
            </div>
          )}
        </label>

        {/* Manual fields (always available) */}
        <label className="field">
          <span>Title</span>
          <input
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
          />
        </label>

        <label className="field">
          <span>Notes</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional details"
          />
        </label>

        <div className="field-grid">
          <label className="field">
            <span>Cluster</span>
            <input
              type="text"
              value={cluster}
              onChange={(e) => setCluster(e.target.value)}
              placeholder="e.g., Home, Colton"
            />
          </label>

          <label className="field">
            <span>Due date</span>
            <div style={{display:'flex', gap:8}}>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              {/* Quick date helpers */}
              <div className="chip-row" style={{display:'flex', gap:6}}>
                <button type="button" className="chip" onClick={()=> setDueDate(today)}>Today</button>
                <button type="button" className="chip" onClick={()=> setDueDate(addDays(today, 1))}>Tomorrow</button>
                <button type="button" className="chip" onClick={()=> setDueDate('')}>No date</button>
              </div>
            </div>
          </label>
        </div>

        <label className="field">
          <span>Repeat</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {RRULE_PRESETS.map(([label, value]) => (
              <button
                key={value}
                type="button"
                className={rrule === value ? 'chip active' : 'chip'}
                onClick={() => setRRule(rrule === value ? '' : value)}
                title={value}
              >
                {label}
              </button>
            ))}
            <input
              type="text"
              value={rrule}
              onChange={(e) => setRRule(e.target.value)}
              placeholder="Custom RRULE (optional)"
              style={{ flex: 1, minWidth: 160 }}
            />
          </div>
          <div className="muted" style={{fontSize:'0.8rem', marginTop:6}}>
            Natural language also works in Smart input: <code>every 3 days</code>, <code>weekdays</code>, <code>every month on the 15th</code>, <code>every first monday</code>.
          </div>
        </label>

        {err && <div className="error">{err}</div>}

        <div className="modal-actions">
          <button onClick={onClose} disabled={saving}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !(title.trim() || stripSyntaxFromTitle(smart))}>
            {saving ? 'Saving…' : (isEdit ? 'Save' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  );
}
