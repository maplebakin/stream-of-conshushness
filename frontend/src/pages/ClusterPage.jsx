import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import './ClusterPage.css'; // optional: add styling separately

export default function ClusterPage() {
  const { id } = useParams(); // clusterId from URL
  const [cluster, setCluster] = useState(null);
  const [entries, setEntries] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const fetchClusterData = async () => {
      try {
        const [clusterRes, entryRes, taskRes] = await Promise.all([
          axios.get(`/api/clusters/${id}`),
          axios.get(`/api/entries?cluster=${id}`),
          axios.get(`/api/tasks?cluster=${id}`), // you may need to build this endpoint if not already
        ]);

        setCluster(clusterRes.data);
        setEntries(entryRes.data);
        setTasks(taskRes.data);
      } catch (err) {
        console.error('Error loading cluster data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchClusterData();
  }, [id]);

  const handleAddToToday = async (taskId) => {
    try {
      await axios.patch(`/api/tasks/${taskId}/addToToday`, { date: today });
      setTasks((prev) =>
        prev.map((task) =>
          task._id === taskId
            ? { ...task, addedToToday: [...(task.addedToToday || []), today] }
            : task
        )
      );
    } catch (err) {
      console.error('Failed to add task to today:', err);
    }
  };

  if (loading) return <p>Loading your cluster...</p>;
  if (!cluster) return <p>Cluster not found.</p>;

  return (
    <main className="cluster-page">
      <header className="cluster-header" style={{ backgroundColor: cluster.color }}>
        <h1>{cluster.icon} {cluster.name}</h1>
        {cluster.description && <p className="cluster-desc">{cluster.description}</p>}
      </header>

      <section className="cluster-columns">
        {/* LEFT: ENTRIES */}
        <div className="cluster-column">
          <h2>Entries</h2>
          <button className="add-entry">+ New Entry</button>
          {entries.length === 0 ? (
            <p>No entries yet.</p>
          ) : (
            entries
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
              .map((entry) => (
                <div key={entry._id} className="entry-card">
                  <p className="entry-date">{new Date(entry.createdAt).toLocaleDateString()}</p>
                  <p className="entry-snippet">{entry.content.slice(0, 100)}…</p>
                </div>
              ))
          )}
        </div>

        {/* RIGHT: TASKS */}
        <div className="cluster-column">
          <h2>Tasks</h2>
          <button className="add-task">+ New Task</button>
          {tasks.length === 0 ? (
            <p>No tasks yet.</p>
          ) : (
            tasks.map((task) => (
              <div key={task._id} className="task-card">
                <label>
                  <input type="checkbox" checked={task.completed} readOnly />
                  {task.content}
                </label>
                <div className="task-meta">
                  {task.dueDate && (
                    <span className="task-date">Due: {new Date(task.dueDate).toLocaleDateString()}</span>
                  )}
                  {!(task.addedToToday || []).includes(today) && (
                    <button onClick={() => handleAddToToday(task._id)} className="add-to-today">
                      ➕ Add to Today
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
