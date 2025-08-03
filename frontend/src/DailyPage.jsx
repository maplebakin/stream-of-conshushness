import React, { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext';
import TaskList from './TaskList';
import EntryModal from './EntryModal';
import AppointmentModal from './AppointmentModal';
import DailyRipples from './DailyRipples.jsx';
import {
  Calendar, ChevronLeft, ChevronDown, ChevronRight, Clock, Star,
  CheckSquare, FileText, PenTool, Waves, Plus, MapPin, AlertCircle,
  Sun, Moon, Coffee
} from 'lucide-react';

const HourlySchedule = ({ date }) => <div>Hourly schedule here</div>;
const TopPriorities = ({ date }) => <div>Top priorities here</div>;
const NotesSection = ({ date }) => <div>Notes here</div>;
const EntriesSection = ({ date }) => <div>Entries here</div>;


export default function DailyPage() {
  const date = new Date().toISOString().split('T')[0];
  const { token } = useContext(AuthContext);
  const [appointments, setAppointments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [importantEvents, setImportantEvents] = useState([]);
  const [isScheduleOpen, setIsScheduleOpen] = useState(true);
  const [error, setError] = useState(null);
  const [showEntryModal, setShowEntryModal] = useState(false);

  useEffect(() => {
    if (window.innerWidth < 800) setIsScheduleOpen(false);
  }, []);

  useEffect(() => {
    if (!date || !token) return;

    axios.get(`/api/appointments/${date}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => setAppointments(res.data || []))
      .catch(err => console.error('❌ Failed to load appointments:', err));

    axios.get(`/api/tasks?date=${date}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => setTasks(res.data || []))
      .catch((err) => {
        console.error('❌ Error fetching tasks:', err);
        setError('Failed to load tasks');
      });
  }, [date, token]);

  const toggleSchedule = () => setIsScheduleOpen((prev) => !prev);

  const [yyyy, mm, dd] = date.split('-');
  const dateObj = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const isToday = new Date().toDateString() === dateObj.toDateString();
  const isWeekend = [0, 6].includes(dateObj.getDay());
  const hour = new Date().getHours();
  const getGreeting = () => {
    if (hour < 12) return { text: 'Good morning', icon: Sun };
    if (hour < 17) return { text: 'Good afternoon', icon: Coffee };
    return { text: 'Good evening', icon: Moon };
  };
  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-lg shadow-md max-w-md">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <button onClick={() => window.history.back()} className="p-2 hover:bg-gray-100 rounded-full text-gray-600 hover:text-gray-900 flex items-center gap-2">
                <ChevronLeft className="h-5 w-5" />
                <span className="hidden sm:inline">Back to Calendar</span>
              </button>
              <div className="text-center">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-3">
                  <Calendar className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600" />
                  {formattedDate}
                </h1>
                {isToday && (
                  <div className="flex items-center justify-center gap-2 mt-2 text-blue-600">
                    <GreetingIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">{greeting.text}!</span>
                  </div>
                )}
                {isWeekend && (
                  <span className="inline-block mt-2 bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full">Weekend</span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <button className="p-2 hover:bg-gray-100 rounded-full" onClick={() => setShowEntryModal(true)}>
                  <Plus className="h-5 w-5 text-green-600" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                <button onClick={toggleSchedule} className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-gray-600" />
                    Schedule
                  </h2>
                  {isScheduleOpen ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
                </button>
                {isScheduleOpen && <div className="px-6 pb-6"><HourlySchedule date={date} /></div>}
              </div>

              <div className="bg-white rounded-lg shadow-sm border">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-gray-600" /> Appointments
                  </h2>
                </div>
                <div className="p-6 space-y-3">
                  {appointments.length === 0 ? (
                    <p className="text-sm text-gray-500">No appointments today.</p>
                  ) : (
                    appointments.map(appt => (
                      <div key={appt._id} className="text-sm bg-blue-50 p-2 rounded">
                        <strong>{appt.time}</strong> — {appt.details}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Waves className="h-5 w-5 text-blue-600" /> Today's Ripples
                  </h2>
                </div>
                <div className="p-6">
                  <DailyRipples date={date} />
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-lg shadow-sm border">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Star className="h-5 w-5 text-amber-500" /> Top Priorities
                  </h2>
                </div>
                <div className="p-6">
                  <TopPriorities date={date} importantEvents={importantEvents} />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <CheckSquare className="h-5 w-5 text-green-600" /> Tasks
                  </h2>
                </div>
                <div className="p-6">
                  <TaskList tasks={tasks} selectedDate={date} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg shadow-sm border">
                  <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <PenTool className="h-5 w-5 text-yellow-600" /> Notes
                    </h2>
                  </div>
                  <div className="p-6">
                    <NotesSection date={date} />
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border">
                  <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-purple-600" /> Journal Entries
                    </h2>
                  </div>
                  <div className="p-6">
                    <EntriesSection date={date} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showEntryModal && (
        <EntryModal
          isOpen={showEntryModal}
          onClose={() => setShowEntryModal(false)}
          date={date}
          onSave={() => {
            setShowEntryModal(false);
          }}
          existingSections={[]} // can fill in with your real section list
          availableGoals={[]} // link when Goal system is added
          availableClusters={[]} // link when Clusters are ready
        />

      )}
      <DailyRipples date={selectedDate} />
    </>
    
  );
}
