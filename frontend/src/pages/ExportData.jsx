// frontend/src/pages/ExportData.jsx
// Data export page - allows users to download their data

import React, { useState, useEffect } from 'react';
import axiosInstance from '../api/axiosInstance';
import toast from 'react-hot-toast';
import '../base.css';

const STAT_ITEMS = [
  ['Entries', 'entries'],
  ['Tasks', 'tasks'],
  ['Goals', 'goals'],
  ['Notes', 'notes'],
  ['Habits', 'habits'],
  ['Clusters', 'clusters'],
  ['Sections', 'sections'],
  ['Pages', 'sectionPages'],
  ['Appointments', 'appointments'],
  ['Events', 'importantEvents'],
  ['Ripples', 'ripples'],
  ['Suggested Tasks', 'suggestedTasks'],
  ['Gather Items', 'gatherItems'],
  ['Suggested Gather', 'suggestedGatherItems'],
  ['Interests', 'interests'],
  ['Suggested Interests', 'suggestedInterests'],
  ['Research Subjects', 'researchSubjects'],
  ['Games', 'games'],
  ['Game Notes', 'gameNotes'],
  ['Schedule Items', 'scheduleItems'],
];

export default function ExportData() {
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchStatistics();
  }, []);

  const fetchStatistics = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get('/export/statistics');
      setStatistics(response.data);
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
      toast.error('Failed to load export statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleExportJSON = async () => {
    try {
      setExporting(true);
      toast.loading('Preparing your data export...');

      const response = await axiosInstance.get('/export/json', {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `streamofconshushness-export-${Date.now()}.json`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);

      toast.dismiss();
      toast.success('Export downloaded successfully!');
    } catch (error) {
      console.error('Export failed:', error);
      toast.dismiss();
      toast.error('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportCSV = async (type) => {
    try {
      setExporting(true);
      toast.loading(`Exporting ${type}...`);

      const response = await axiosInstance.get(`/export/csv/${type}`, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type}-export-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);

      toast.dismiss();
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} exported successfully!`);
    } catch (error) {
      console.error('Export failed:', error);
      toast.dismiss();
      toast.error('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="card">
          <p>Loading export statistics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <h1 style={{ marginBottom: '1rem' }}>Export Your Data</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Download your Stream of Conshushness data for backup or migration purposes.
        </p>

        {/* Statistics Card */}
        {statistics && (
          <div className="card" style={{ marginBottom: '2rem' }}>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Your Data</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {STAT_ITEMS.map(([label, key]) => (
                <StatItem key={key} label={label} count={statistics[key] || 0} />
              ))}
            </div>
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
              <strong>Total Items: {statistics.total}</strong>
            </div>
          </div>
        )}

        {/* Full Export */}
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>Full Export (JSON)</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.95rem' }}>
            Download all your data in a single JSON file, including entries, tasks, goals, notes,
            habits, clusters, sections, appointments, review queues, gather lists, interests,
            research, games, schedules, and ripples.
          </p>
          <button
            onClick={handleExportJSON}
            disabled={exporting}
            className="button-primary"
            style={{ width: '100%' }}
          >
            {exporting ? 'Exporting...' : 'Download Full Export (JSON)'}
          </button>
        </div>

        {/* CSV Exports */}
        <div className="card">
          <h2 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>CSV Exports</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
            Download specific data types as CSV files. These can be opened in Excel, Google Sheets,
            or any spreadsheet application.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <ExportButton
              label="Export Entries as CSV"
              description={`${statistics?.entries || 0} entries`}
              onClick={() => handleExportCSV('entries')}
              disabled={exporting || !statistics?.entries}
            />
            <ExportButton
              label="Export Tasks as CSV"
              description={`${statistics?.tasks || 0} tasks`}
              onClick={() => handleExportCSV('tasks')}
              disabled={exporting || !statistics?.tasks}
            />
            <ExportButton
              label="Export Goals as CSV"
              description={`${statistics?.goals || 0} goals`}
              onClick={() => handleExportCSV('goals')}
              disabled={exporting || !statistics?.goals}
            />
          </div>
        </div>

        {/* Info Box */}
        <div className="alert" style={{ marginTop: '2rem', background: 'var(--bg-info)', borderColor: 'var(--border-info)' }}>
          <strong>Note:</strong> Your password and sensitive authentication data are never included in exports.
          All exported data is your personal content only.
        </div>
      </div>
    </div>
  );
}

function StatItem({ label, count }) {
  return (
    <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
        {count.toLocaleString()}
      </div>
    </div>
  );
}

function ExportButton({ label, description, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem',
        background: disabled ? 'var(--bg-disabled)' : 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s'
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = 'var(--bg-hover)';
          e.currentTarget.style.borderColor = 'var(--accent-primary)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = disabled ? 'var(--bg-disabled)' : 'var(--bg-secondary)';
        e.currentTarget.style.borderColor = 'var(--border-primary)';
      }}
    >
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>{label}</div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{description}</div>
      </div>
      <div style={{ fontSize: '1.25rem' }}>↓</div>
    </button>
  );
}
