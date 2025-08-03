import EntryModal from './EntryModal.jsx';
import axios from './api/axiosInstance';
import { useEffect, useState, useContext } from 'react';
import './Main.css';
import { AuthContext } from './AuthContext.jsx';
import toast from 'react-hot-toast';

function getTodayISO() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
}

export default function MainPage() {
  const { token } = useContext(AuthContext);
  const [entries, setEntries] = useState([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!token) return;
    axios
      .get('/api/entries', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const sorted = [...res.data].sort((a, b) => {
          if (a.date !== b.date) {
            return new Date(b.date) - new Date(a.date); // Newer days first
          }
          return new Date(b.createdAt) - new Date(a.createdAt); // Newer entries later in day
        });
        setEntries(sorted);
      })
      .catch((err) => {
        console.error('⚠️ Error fetching entries:', err);
        toast.error('Failed to load entries');
      });
  }, [token]);

  const handleDelete = (id) => {
    axios
      .delete(`/api/entries/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then(() => {
        setEntries((prev) => prev.filter((e) => e._id !== id));
        toast.success('Entry deleted');
      })
      .catch(() => {
        toast.error('Could not delete entry');
      });
  };

  return (
    <main className="stream-page">
      <section className="stream-header">
        <button className="add-entry-btn" onClick={() => setShowModal(true)}>
          + New Entry
        </button>
      </section>

      <section className="entry-feed">
        {entries.map((entry) => (
          <div className="entry-card" key={entry._id}>
            <div className="entry-meta">
              <span>{entry.date}</span>
              {entry.cluster && <span className="cluster-chip">{entry.cluster}</span>}
              {entry.suggestedTasks?.length > 0 && (
                <span className="ripple-indicator" title="Suggested tasks found">💡</span>
              )}
            </div>
            <div
              className="entry-text"
              dangerouslySetInnerHTML={{ __html: entry.content }}
            ></div>
            <div className="entry-actions">
              <button onClick={() => handleDelete(entry._id)}>🗑️</button>
            </div>
          </div>
        ))}
      </section>

      <EntryModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        date={getTodayISO()}
        existingSections={[]} // Add real section list if you want
        availableGoals={[]}   // Add real goal list if available
        availableClusters={[]} // Add real cluster list if needed
        onSave={(newEntry) => {
          setEntries(prev => [newEntry, ...prev]);
          setShowModal(false);
        }}
      />
    </main>
  );
}
