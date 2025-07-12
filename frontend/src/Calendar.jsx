import { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance';
import './Calendar.css';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from './AuthContext.jsx';

export default function Calendar() {
  const navigate = useNavigate();
  const { token } = useContext(AuthContext);

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayStr = now.toISOString().slice(0, 10);

  const [calendarData, setCalendarData] = useState({});
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [showForm, setShowForm] = useState(false);
  const [newAppointment, setNewAppointment] = useState({ date: '', time: '', details: '' });
  const [importantEvents, setImportantEvents] = useState([]);
  const [newEvent, setNewEvent] = useState({ title: '', date: '' });
  const [showEventForm, setShowEventForm] = useState(false);
  const [showMonthMenu, setShowMonthMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 800);

  // Track window resize for mobile responsiveness
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 800);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Utility
  const getDaysUntil = (dateStr) => {
    const eventDate = new Date(dateStr);
    const today = new Date(todayStr);
    eventDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffMs = eventDate - today;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays > 1) return `${diffDays} Days Away`;
    return `${Math.abs(diffDays)} Days Ago`;
  };

  // Month Tabs
  const monthOptions = [
    ['J', 'January', '01'],
    ['F', 'February', '02'],
    ['MR', 'March', '03'],
    ['MA', 'April', '04'],
    ['MY', 'May', '05'],
    ['JN', 'June', '06'],
    ['JL', 'July', '07'],
    ['AU', 'August', '08'],
    ['S', 'September', '09'],
    ['O', 'October', '10'],
    ['N', 'November', '11'],
    ['D', 'December', '12']
  ];

  const renderMonthTab = ([abbr, full, monthNum]) => {
    const yearStr = String(now.getFullYear());
    const monthKey = `${yearStr}-${monthNum}`;
    const active = monthKey === selectedMonth;
    return (
      <div
        key={monthKey}
        className={`month-tab ${active ? 'active' : ''}`}
        onClick={() => {
          setSelectedMonth(monthKey);
          setShowMonthMenu(false);
        }}
      >
        {isMobile ? (
          <span className="month-label">{full}</span>
        ) : (
          <>
            <span className="collapsed-label">{abbr}</span>
            <span className="expanded-label">{full}</span>
          </>
        )}
      </div>
    );
  };

  // Fetch appointments
  const fetchCalendar = () => {
    axios.get('/api/calendar-data', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => setCalendarData(res.data))
    .catch(err => console.error('Error fetching calendar:', err));
  };

  useEffect(() => {
    fetchCalendar();
  }, [token]);

  // Fetch important events for the month
 useEffect(() => {
  if (!selectedMonth) return;
  axios.get(`/api/important-events/month/${selectedMonth}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  .then(res => {
    console.log('Fetched important events:', res.data);  // ADD THIS LINE
    setImportantEvents(Array.isArray(res.data) ? res.data : []);
  })
  .catch(() => setImportantEvents([]));
}, [selectedMonth, token]);

  // Set of dates with events for easy lookup
  const importantEventDates = new Set(
    importantEvents.map(ev => ev.date)
  );

  // Add Important Event
  const handleAddImportantEvent = (e) => {
    e.preventDefault();
    if (!newEvent.title.trim() || !newEvent.date.trim()) {
      alert('Please fill in both title and date.');
      return;
    }
    axios.post('/api/important-events', {
      title: newEvent.title,
      date: newEvent.date
    }, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(() => {
      setNewEvent({ title: '', date: '' });
      return axios.get(`/api/important-events/month/${selectedMonth}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    })
    .then(res => setImportantEvents(Array.isArray(res.data) ? res.data : []))
    .catch(err => console.error('Error adding event:', err));
  };

  // Delete Important Event
  const handleDeleteImportantEvent = (id) => {
    axios.delete(`/api/important-events/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(() => axios.get(`/api/important-events/month/${selectedMonth}`, {
      headers: { Authorization: `Bearer ${token}` }
    }))
    .then(res => setImportantEvents(Array.isArray(res.data) ? res.data : []))
    .catch(err => console.error('Error deleting event:', err));
  };

  // Add Appointment
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newAppointment.date || !newAppointment.time || !newAppointment.details) {
      alert('Please fill all fields');
      return;
    }
    axios.post('/api/add-appointment', newAppointment, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(() => {
      fetchCalendar();
      setShowForm(false);
      setNewAppointment({ date: '', time: '', details: '' });
    })
    .catch(err => console.error('Error saving appointment:', err));
  };

  const handleDeleteAppointment = async (date, time, e) => {
    e.stopPropagation();
    try {
      await axios.delete('/api/delete-appointment', {
        headers: { Authorization: `Bearer ${token}` },
        data: { date, time }
      });
      fetchCalendar();
    } catch (err) {
      console.error('Error deleting appointment:', err);
    }
  };

  const handleDayClick = (dateStr) => navigate(`/day/${dateStr}`);

  const handleMonthChange = (direction) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const date = new Date(y, m - 1 + direction);
    const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
  };

  const formatMonthYear = (monthKey) => {
    const [yyyy, mm] = monthKey.split('-');
    const date = new Date(yyyy, mm - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const [year, month] = selectedMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const monthData = calendarData[selectedMonth]?.days || {};

  return (
    <div className="calendar-page">
      <header>
        <h1>Stream of Conshushness — Calendar</h1>
        <nav>
          <Link to="/">🡐 Back to Journal</Link>
        </nav>
      </header>

      <div className="calendar-layout">
        <aside className="important-events">
          <h3>Important Events</h3>
          <button
            type="button"
            className="toggle-event-form-button"
            onClick={() => setShowEventForm(!showEventForm)}
          >
            {showEventForm ? 'Hide Add Event' : '+ Add Event'}
          </button>

          {showEventForm && (
            <form className="important-event-form" onSubmit={handleAddImportantEvent}>
              <input
                type="text"
                placeholder="Event Title"
                value={newEvent.title}
                onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
              />
              <input
                type="date"
                value={newEvent.date}
                onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
              />
              <button type="submit">+ Add Event</button>
            </form>
          )}

    <ul className="important-event-list">
  {importantEvents.map(ev => (
    <li key={ev._id}>
      <span>{getDaysUntil(ev.date)}: {ev.title}</span>
      <button className="delete-button" onClick={() => handleDeleteImportantEvent(ev._id)}>🗑️</button>
    </li>
  ))}
</ul>


        </aside>

        <section className="calendar-content">
          <div className="calendar-header">
            <button onClick={() => handleMonthChange(-1)}>&lt;</button>
            <h2>{formatMonthYear(selectedMonth)}</h2>
            <button onClick={() => handleMonthChange(1)}>&gt;</button>
          </div>

          <div className="add-appointment">
            <div className="add-appointment-buttons">
              <button onClick={() => setShowForm(!showForm)}>
                {showForm ? 'Close' : '+ Add Appointment'}
              </button>

              <div className="calendar-controls">
                <button onClick={() => navigate(`/day/${todayStr}`)}>
                  Today
                </button>
                {isMobile && (
                  <button onClick={() => setShowMonthMenu(!showMonthMenu)}>
                    {showMonthMenu ? 'Hide Months' : 'Month'}
                  </button>
                )}
              </div>
            </div>

            {isMobile && showMonthMenu && (
              <div className="month-tabs">
                {monthOptions.map(renderMonthTab)}
              </div>
            )}

            {showForm && (
              <form onSubmit={handleSubmit}>
                <label>
                  Date
                  <input
                    type="date"
                    name="date"
                    value={newAppointment.date}
                    onChange={e => setNewAppointment({ ...newAppointment, date: e.target.value })}
                  />
                </label>
                <label>
                  Time
                  <input
                    type="time"
                    name="time"
                    value={newAppointment.time}
                    onChange={e => setNewAppointment({ ...newAppointment, time: e.target.value })}
                  />
                </label>
                <label>
                  Details
                  <input
                    type="text"
                    name="details"
                    value={newAppointment.details}
                    onChange={e => setNewAppointment({ ...newAppointment, details: e.target.value })}
                  />
                </label>
                <button type="submit">Save Appointment</button>
              </form>
            )}
          </div>

          <div className="calendar-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="day-of-week">{d}</div>
            ))}

            {Array.from({ length: firstWeekday }, (_, i) => (
              <div key={`empty-${i}`} className="empty-cell" />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayData = monthData[dateStr];
              const isImportant = importantEventDates.has(dateStr);
              const isPast = dateStr < todayStr;
              const isToday = dateStr === todayStr;

              return (
                <div
                  key={dateStr}
                  className={`calendar-day ${dayData ? 'has-note' : ''} ${isImportant ? 'has-important' : ''} ${isPast ? 'past-day' : ''} ${isToday ? 'today' : ''}`}
                  onClick={() => handleDayClick(dateStr)}
                >
                  <div className="date-label">
                    {day}
                    {isImportant && <span className="star">★</span>}
                  </div>
                  {dayData?.schedule &&
                    Object.entries(dayData.schedule).map(([time, details]) => (
                      <div key={time} className="day-appointment">
                        <span>{time} - {details}</span>
                        <button onClick={(e) => handleDeleteAppointment(dateStr, time, e)}>🗑️</button>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </section>

        {!isMobile && (
          <aside className="calendar-sidebar">
            <div className="month-tabs">
              {monthOptions.map(renderMonthTab)}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
