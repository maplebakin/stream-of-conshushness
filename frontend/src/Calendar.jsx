// frontend/src/pages/Calendar.jsx
import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Star,
  FileText,
  CheckSquare,
  Trash2,
  ArrowLeft,
  Home,
  X
} from 'lucide-react';

/**
 * Stream of Conshushness – Calendar Page
 * -------------------------------------
 *  • Month navigation
 *  • Appointment creation (mock)
 *  • “Important Events” sidebar
 * Swap in real data hooks once the backend endpoints are ready.
 */

export default function Calendar() {
  /* ─ Helpers ─ */
  const getTodayISO = () => new Date().toISOString().slice(0, 10);

  /* ─ Local state ─ */
  const todayStr       = getTodayISO();
  const now            = new Date();
  const defaultMonth   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [selectedMonth,   setSelectedMonth]   = useState(defaultMonth);
  const [calendarData,    setCalendarData]    = useState({});
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  /* Appointment form */
  const [showApptForm,   setShowApptForm]   = useState(false);
  const [newAppointment, setNewAppointment] = useState({ date: '', time: '', details: '' });

  /* Important events */
  const [importantEvents, setImportantEvents] = useState([]);
  const [showEventForm,   setShowEventForm]   = useState(false);
  const [newEvent,        setNewEvent]        = useState({ title: '', date: '' });

  /* Mobile check */
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 800);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 800);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* Mock fetch on month change */
  useEffect(() => {
    setLoadingCalendar(true);
    setTimeout(() => {
      setCalendarData({
        [selectedMonth]: {
          days: {
            [`${selectedMonth}-15`]: {
              schedule: {
                '09:00': { _id: '1', details: 'Team Meeting',  time: '09:00' },
                '14:00': { _id: '2', details: 'Client Call',   time: '14:00' }
              },
              entries: [{ content: 'Great day for productivity' }],
              tasks  : [{ details: 'Complete project proposal' }]
            },
            [`${selectedMonth}-20`]: { entries: [{ content: 'Reflection on the week' }] },
            [todayStr]: {
              schedule: { '10:00': { _id: '3', details: 'Design Review', time: '10:00' } },
              tasks   : [{ details: 'Review mockups' }, { details: 'Update documentation' }]
            }
          }
        }
      });

      setImportantEvents([
        { _id: 'evt-1', title: 'Project Deadline', date: `${selectedMonth}-25` },
        { _id: 'evt-2', title: 'Team Offsite',     date: `${selectedMonth}-30` }
      ]);

      setLoadingCalendar(false);
    }, 800);
  }, [selectedMonth, todayStr]);

  /* ─ Utilities ─ */
  const monthNames = [
    { name: 'January', short: 'Jan', value: '01' }, { name: 'February', short: 'Feb', value: '02' },
    { name: 'March',   short: 'Mar', value: '03' }, { name: 'April',    short: 'Apr', value: '04' },
    { name: 'May',     short: 'May', value: '05' }, { name: 'June',     short: 'Jun', value: '06' },
    { name: 'July',    short: 'Jul', value: '07' }, { name: 'August',   short: 'Aug', value: '08' },
    { name: 'September', short: 'Sep', value: '09' }, { name: 'October', short: 'Oct', value: '10' },
    { name: 'November',  short: 'Nov', value: '11' }, { name: 'December', short: 'Dec', value: '12' }
  ];

  const formatMonthYear = (key) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const getDaysUntil = (dateStr) => {
    const eventDate = new Date(dateStr);
    const today     = new Date(todayStr);
    eventDate.setHours(0,0,0,0);
    today.setHours(0,0,0,0);
    const diff = Math.round((eventDate - today) / 86_400_000);
    if (diff === 0) return { label: 'Today',        class: 'text-blue-600 bg-blue-100'  };
    if (diff === 1) return { label: 'Tomorrow',     class: 'text-green-600 bg-green-100'};
    if (diff >  1)  return { label: `${diff} Days`, class: 'text-gray-600 bg-gray-100'  };
    return            { label: `${Math.abs(diff)} Ago`, class: 'text-red-600 bg-red-100' };
  };

  /* ─ Navigation helpers ─ */
  const changeMonth = (dir) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const next   = new Date(y, m - 1 + dir);
    setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };

  const goToToday      = () => console.log('Navigate to:', todayStr);
  const handleDayClick = (d)  => console.log('Navigate to day:', d);

  /* ─ Form handlers ─ */
  const saveAppointment = (e) => {
    e.preventDefault();
    const { date, time, details } = newAppointment;
    if (!date || !time || !details) return alert('Please fill out every field.');
    console.log('Save appointment:', newAppointment);
    setNewAppointment({ date: '', time: '', details: '' });
    setShowApptForm(false);
  };

  const addImportantEvent = (e) => {
    e.preventDefault();
    const { title, date } = newEvent;
    if (!title.trim() || !date.trim()) return alert('Please fill out both fields.');
    console.log('Add event:', newEvent);
    setNewEvent({ title: '', date: '' });
    setShowEventForm(false);
  };

  /* ─ Calendar math ─ */
  const [year, month] = selectedMonth.split('-').map(Number);
  const daysInMonth   = new Date(year, month, 0).getDate();
  const firstWeekday  = new Date(year, month - 1, 1).getDay();
  const monthData     = calendarData[selectedMonth]?.days || {};

  /* ─ Render ─ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* === Header === */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-4 sm:px-6 lg:px-8 py-5">
          <button onClick={() => window.history.back()} className="flex items-center gap-2 p-2 rounded-full text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition">
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline">Back to Journal</span>
          </button>

          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <CalendarIcon className="w-7 h-7 text-blue-600" />
              Calendar
            </h1>
            <p className="text-gray-600 mt-1">Plan your days and track important events</p>
          </div>

          <button onClick={goToToday} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition">
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Today</span>
          </button>
        </div>
      </header>

      {/* === Body === */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* ─ Left Sidebar – Important Events ─ */}
          <aside className="space-y-6 lg:col-span-1">
            <section className="bg-white border rounded-lg shadow-sm">
              <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <Star className="w-5 h-5 text-amber-500" />
                  Important Events
                </h2>
                <button onClick={() => setShowEventForm(p => !p)} className="p-2 rounded-full hover:bg-gray-100 transition">
                  <Plus className="w-4 h-4 text-gray-600" />
                </button>
              </div>

              <div className="p-6">
                {/* Add-event form */}
                {showEventForm && (
                  <form onSubmit={addImportantEvent} className="space-y-4 mb-6 p-4 bg-gray-50 rounded-lg">
                    <input type="text" placeholder="Event title"
                      value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                    <input type="date"
                      value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                    <div className="flex gap-2">
                      <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition">Add Event</button>
                      <button type="button" onClick={() => setShowEventForm(false)} className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md transition">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </form>
                )}

                {/* Event list */}
                <div className="space-y-3">
                  {importantEvents.length === 0 ? (
                    <div className="text-center py-8">
                      <Star className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 mb-2">No events this month</p>
                      <button onClick={() => setShowEventForm(true)} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                        Add your first event
                      </button>
                    </div>
                  ) : (
                    importantEvents.map(evt => {
                      const badge = getDaysUntil(evt.date);
                      return (
                        <div key={evt._id} className="p-4 bg-white border rounded-lg hover:shadow-sm transition">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h3 className="font-medium text-gray-900 mb-2">{evt.title}</h3>
                              <span className={`inline-block text-xs font-medium rounded-full px-2 py-1 ${badge.class}`}>{badge.label}</span>
                            </div>
                            <button onClick={() => setImportantEvents(list => list.filter(e => e._id !== evt._id))}
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-100 rounded transition">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>

            {/* Quick-jump grid for mobile */}
            {isMobile && (
              <section className="bg-white border rounded-lg shadow-sm p-4">
                <h3 className="font-medium text-gray-900 mb-3">Quick Month Jump</h3>
                <div className="grid grid-cols-3 gap-2">
                  {monthNames.map(m => {
                    const key    = `${year}-${m.value}`;
                    const active = key === selectedMonth;
                    return (
                      <button key={m.value} onClick={() => setSelectedMonth(key)}
                        className={`text-xs p-2 rounded-md transition ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                        {m.short}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </aside>

          {/* ─ Main Calendar Grid ─ */}
          <section className="space-y-6 lg:col-span-3">
            {/* Month nav & add appt */}
            <div className="bg-white border rounded-lg shadow-sm">
              <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-4">
                  <button onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-gray-100 transition">
                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <h2 className="text-xl font-semibold text-gray-900">{formatMonthYear(selectedMonth)}</h2>
                  <button onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-gray-100 transition">
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                  </button>
                </div>

                <button onClick={() => setShowApptForm(p => !p)}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition">
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Add Appointment</span>
                </button>
              </div>

              {/* Appointment form */}
              {showApptForm && (
                <form onSubmit={saveAppointment} className="mt-4 px-6 pb-6 space-y-4 bg-gray-50">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <input type="date"  value={newAppointment.date}     onChange={e => setNewAppointment({ ...newAppointment, date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                    <input type="time"  value={newAppointment.time}     onChange={e => setNewAppointment({ ...newAppointment, time: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                    <input type="text"  placeholder="Details…" value={newAppointment.details} onChange={e => setNewAppointment({ ...newAppointment, details: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit"  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition">Save</button>
                    <button type="button" onClick={() => setShowApptForm(false)} className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md transition">Cancel</button>
                  </div>
                </form>
              )}

              {/* Calendar grid */}
              <div className="p-6">
                {loadingCalendar ? (
                  <div className="flex justify-center py-16">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
                  </div>
                ) : (
                  <div className="grid grid-cols-7 gap-1">
                    {/* Weekday headers */}
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                      <div key={d} className="text-sm font-medium text-center text-gray-500 bg-gray-50 p-3">{d}</div>
                    ))}

                    {/* Empty leading cells */}
                    {Array.from({ length: firstWeekday }).map((_, i) => (
                      <div key={`empty-${i}`} className="h-24 bg-gray-50 opacity-50" />
                    ))}

                    {/* Actual days */}
                    {Array.from({ length: daysInMonth }).map((_, idx) => {
                      const day        = idx + 1;
                      const dateStr    = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                      const data       = monthData[dateStr];
                      const isToday    = dateStr === todayStr;
                      const isWeekend  = new Date(year, month - 1, day).getDay() % 6 === 0;
                      const apptCount  = data?.schedule ? Object.keys(data.schedule).length : 0;

                      return (
                        <div key={dateStr} onClick={() => handleDayClick(dateStr)}
                          className={`h-24 p-2 border border-gray-100 cursor-pointer hover:bg-blue-50 hover:shadow-sm transition ${
                            isToday ? 'bg-blue-100 border-blue-300'
                                    : isWeekend ? 'bg-gray-50' : 'bg-white'}`}>
                          {/* Day number */}
                          <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : isWeekend ? 'text-gray-500' : 'text-gray-900'}`}>{day}</div>

                          {/* Up to two appointments */}
                          {data?.schedule && Object.entries(data.schedule).slice(0,2).map(([time,item]) => (
                            <div key={time} className="mb-1">
                              <div className="text-xs bg-blue-500 text-white px-1 py-0.5 rounded truncate flex items-center justify-between group">
                                <span>{time} {item.details}</span>
                                <button onClick={(e) => { e.stopPropagation(); console.log('Delete appt:', item._id); }}
                                  className="opacity-0 group-hover:opacity-100 ml-1 hover:bg-red-500 rounded">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}

                          {/* Entry/task indicators */}
                          <div className="flex items-center gap-1 mt-1">
                            {data?.entries?.length > 0 && (
                              <div className="flex items-center gap-1">
                                <FileText className="w-3 h-3 text-purple-500" />
                                <span className="text-xs text-purple-600">{data.entries.length}</span>
                              </div>
                            )}
                            {data?.tasks?.length > 0 && (
                              <div className="flex items-center gap-1">
                                <CheckSquare className="w-3 h-3 text-green-500" />
                                <span className="text-xs text-green-600">{data.tasks.length}</span>
                              </div>
                            )}
                          </div>

                          {/* More-than-two indicator */}
                          {apptCount > 2 && <div className="text-xs text-gray-500 mt-1">+{apptCount - 2} more</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Quick-month nav for desktop */}
            {!isMobile && (
              <div className="bg-white border rounded-lg shadow-sm">
                <div className="px-6 py-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Month Navigation</h3>
                  <div className="grid grid-cols-6 lg:grid-cols-12 gap-2">
                    {monthNames.map(m => {
                      const key = `${year}-${m.value}`;
                      const active = key === selectedMonth;
                      return (
                        <button key={m.value} onClick={() => setSelectedMonth(key)}
                          className={`p-3 text-sm font-medium rounded-lg transition ${active ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
