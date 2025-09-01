// Dev-only stub props. You can edit live in the harness via JSON.
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');
const todayISO = `${yyyy}-${mm}-${dd}`;

const noop = (...args) => console.log('noop called with:', ...args);

export const DEFAULT_PROPS = {
  AnalyzeEntryButton: {
    entry: { _id: 'demo-entry', text: 'Demo entry text', date: todayISO },
    onAnalyze: noop,
  },
  AppointmentModal: {
    open: true,
    date: `${todayISO}T13:00:00`,
    initialData: null,
    onClose: () => alert('close()'),
    onSave: (data) => alert('save:\n' + JSON.stringify(data, null, 2)),
  },
  DailyRipples: {
    date: todayISO,
  },
  EntryModal: {
    open: true,
    initialEntry: null,
    defaultDate: todayISO,
    onClose: () => alert('close()'),
    onSaved: (entry) => alert('saved:\n' + JSON.stringify(entry, null, 2)),
  },
  EntryQuickAssign: {
    entryId: 'demo-entry',
    sections: ['Stream', 'Games', 'Crochet'],
    onAssigned: noop,
  },
  TaskList: {
    view: 'today',  // 'today' | 'week' | etc., adjust to your API
    date: todayISO,
    cluster: null,
    onTaskClick: noop,
  },
};
