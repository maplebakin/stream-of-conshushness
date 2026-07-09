// frontend/src/pages/GlobalSearch.jsx
// Global search page

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import toast from 'react-hot-toast';
import '../base.css';
import './GlobalSearch.css';

const SEARCH_TYPES = [
  'all',
  'entries',
  'tasks',
  'goals',
  'notes',
  'sections',
  'sectionPages',
  'clusters',
  'appointments',
  'importantEvents',
  'gatherItems',
  'suggestedGatherItems',
  'interests',
  'suggestedInterests',
  'suggestedTasks',
  'habits',
  'researchSubjects',
  'games',
  'gameNotes',
  'scheduleItems',
];

const RESULT_GROUPS = SEARCH_TYPES.filter((type) => type !== 'all');

const FILTER_LABELS = {
  all: 'All',
  sectionPages: 'Pages',
  importantEvents: 'Events',
  gatherItems: 'Gather',
  suggestedGatherItems: 'Suggested Gather',
  suggestedInterests: 'Suggested Interests',
  suggestedTasks: 'Suggested Tasks',
  researchSubjects: 'Research',
  gameNotes: 'Game Notes',
  scheduleItems: 'Schedule',
};

function filterLabel(type) {
  return FILTER_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

function sourceEntryPath(item) {
  if (!item?.sourceDate) return '';
  const hash = item.sourceEntryId ? `#entry-${encodeURIComponent(item.sourceEntryId)}` : '';
  return `/day/${item.sourceDate}${hash}`;
}

function primaryDestination(item) {
  switch (item.type) {
    case 'entry': {
      const hash = item._id ? `#entry-${encodeURIComponent(item._id)}` : '';
      return item.date ? { path: `/day/${item.date}${hash}`, label: 'Open entry day' } : null;
    }
    case 'task':
      return item.dueDate
        ? { path: `/day/${item.dueDate}`, label: 'Open due day' }
        : { path: '/inbox/tasks', label: 'Open task inbox' };
    case 'goal':
      return { path: '/goals', label: 'Open goals' };
    case 'note':
      return item.date ? { path: `/day/${item.date}`, label: 'Open note day' } : null;
    case 'appointment':
    case 'importantEvent':
    case 'scheduleItem':
      return item.date
        ? { path: `/day/${item.date}`, label: 'Open day' }
        : { path: '/calendar', label: 'Open calendar' };
    case 'gatherItem':
      return { path: '/gather-lists', label: 'Open gather lists' };
    case 'interest':
      return { path: '/interests', label: 'Open interests' };
    case 'suggestedTask':
    case 'suggestedGatherItem':
    case 'suggestedInterest':
      return { path: '/review', label: 'Open Review Inbox' };
    case 'habit':
      return { path: '/habits/analytics', label: 'Open habits' };
    case 'researchSubject':
      return { path: '/sections', label: 'Open research' };
    case 'game':
      return { path: item.slug ? `/section/games/${item.slug}` : '/section/games', label: 'Open game' };
    case 'gameNote':
      return { path: '/section/games', label: 'Open games' };
    case 'section':
      return item.slug ? { path: `/sections/${item.slug}`, label: 'Open section' } : { path: '/sections', label: 'Open sections' };
    case 'sectionPage':
      return item.sectionKey && item.slug
        ? { path: `/sections/${item.sectionKey}/${item.slug}`, label: 'Open page' }
        : { path: '/sections', label: 'Open sections' };
    case 'cluster':
      return item.slug ? { path: `/clusters/${item.slug}`, label: 'Open cluster' } : { path: '/clusters', label: 'Open clusters' };
    default:
      return null;
  }
}

function locationText(item) {
  switch (item.type) {
    case 'entry':
      return item.date ? `Entry on ${item.date}` : 'Entry';
    case 'task':
      return item.dueDate ? `Task due ${item.dueDate}` : 'Task in Task Inbox';
    case 'note':
      return item.date ? `Note from ${item.date}` : 'Note';
    case 'appointment':
      return item.date ? `Appointment on ${item.date}` : 'Appointment in Calendar';
    case 'importantEvent':
      return item.date ? `Event on ${item.date}` : 'Event in Calendar';
    case 'scheduleItem':
      return item.date ? `Schedule block on ${item.date}` : 'Schedule block';
    case 'suggestedTask':
    case 'suggestedGatherItem':
    case 'suggestedInterest':
      return item.sourceDate
        ? `Review suggestion from ${item.sourceDate}`
        : 'Review suggestion in Review Inbox';
    case 'gatherItem':
      return item.list ? `Gather item in ${item.list}` : 'Gather item';
    case 'interest':
      return item.category ? `Interest in ${item.category}` : 'Interest';
    case 'goal':
      return 'Goal';
    case 'section':
      return 'Section';
    case 'sectionPage':
      return 'Section page';
    case 'cluster':
      return 'Cluster';
    case 'habit':
      return item.status ? `Habit: ${item.status}` : 'Habit';
    default:
      return '';
  }
}

function isSuggestion(item) {
  return ['suggestedTask', 'suggestedGatherItem', 'suggestedInterest'].includes(item.type);
}

export default function GlobalSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [type, setType] = useState(searchParams.get('type') || 'all');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [hiddenResultKeys, setHiddenResultKeys] = useState(() => new Set());

  // Perform search when query params change
  useEffect(() => {
    const q = searchParams.get('q');
    const t = searchParams.get('type') || 'all';

    if (q && q.length >= 2) {
      setQuery(q);
      setType(t);
      performSearch(q, t);
    }
  }, [searchParams]);

  const performSearch = async (searchQuery, searchType) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      toast.error('Search query must be at least 2 characters');
      return;
    }

    try {
      setLoading(true);
      setHasSearched(true);

      const response = await axiosInstance.get('/search', {
        params: { q: searchQuery, type: searchType, limit: 50 }
      });

      setResults(response.data);
      setHiddenResultKeys(new Set());
    } catch (error) {
      console.error('Search failed:', error);
      toast.error('Search failed. Please try again.');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim().length < 2) {
      toast.error('Search query must be at least 2 characters');
      return;
    }

    // Update URL params
    setSearchParams({ q: query, type });
  };

  const handleTypeChange = (newType) => {
    setType(newType);
    if (query.trim().length >= 2) {
      setSearchParams({ q: query, type: newType });
    }
  };

  const handleNavigate = (item) => {
    const destination = primaryDestination(item);
    if (destination?.path) navigate(destination.path);
  };

  const resultKey = (item, group = '') => `${item.type || group}:${item._id || item.id || item.slug || item.title}`;

  const handleResultAction = async (item, action) => {
    try {
      if (action === 'open') {
        handleNavigate(item);
        return;
      }

      if (action === 'openSource') {
        const path = sourceEntryPath(item);
        if (path) navigate(path);
        return;
      }

      if (action === 'completeTask') {
        await axiosInstance.patch(`/api/tasks/${item._id}/toggle`);
        setHiddenResultKeys((current) => new Set([...current, resultKey(item)]));
        toast.success('Task completed.');
        return;
      }

      if (action === 'review') {
        navigate('/review');
        return;
      }
    } catch (error) {
      console.error('[GlobalSearch] action failed:', error?.response?.data || error.message);
      toast.error(error?.response?.data?.error || 'Could not update this result.');
    }
  };

  const getTypeLabel = (itemType) => {
    const labels = {
      entry: 'Entry',
      task: 'Task',
      goal: 'Goal',
      note: 'Note',
      section: 'Section',
      sectionPage: 'Page',
      cluster: 'Cluster',
      appointment: 'Appointment',
      importantEvent: 'Event',
      gatherItem: 'Gather Item',
      suggestedGatherItem: 'Suggested Gather',
      interest: 'Interest',
      suggestedInterest: 'Suggested Interest',
      suggestedTask: 'Suggested Task',
      habit: 'Habit',
      researchSubject: 'Research',
      game: 'Game',
      gameNote: 'Game Note',
      scheduleItem: 'Schedule'
    };
    return labels[itemType] || itemType;
  };

  const getTypeColor = (itemType) => {
    const colors = {
      entry: '#9b87f5',
      task: '#0EA5E9',
      goal: '#10B981',
      note: '#F59E0B',
      section: '#8B5CF6',
      sectionPage: '#EC4899',
      cluster: '#6366F1',
      appointment: '#14B8A6',
      importantEvent: '#EF4444',
      gatherItem: '#F97316',
      suggestedGatherItem: '#FB923C',
      interest: '#22C55E',
      suggestedInterest: '#84CC16',
      suggestedTask: '#38BDF8',
      habit: '#A855F7',
      researchSubject: '#64748B',
      game: '#EAB308',
      gameNote: '#CA8A04',
      scheduleItem: '#06B6D4'
    };
    return colors[itemType] || '#6B7280';
  };

  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const highlightMatch = (text, query) => {
    if (!text || !query) return text;

    const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} style={{ background: '#fef08a', padding: '2px 4px', borderRadius: '2px' }}>
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="page">
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ marginBottom: '1.5rem' }}>Search</h1>

        {/* Search Form */}
        <form onSubmit={handleSearch} style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search across all your content..."
              style={{
                flex: 1,
                padding: '0.75rem',
                fontSize: '1rem',
                border: '2px solid var(--border-primary)',
                borderRadius: '8px',
                background: 'var(--bg-primary)'
              }}
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || query.trim().length < 2}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                fontWeight: 500,
                background: 'var(--accent-primary)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading || query.trim().length < 2 ? 0.5 : 1
              }}
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Type Filter */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {SEARCH_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTypeChange(t)}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: type === t ? 600 : 400,
                  background: type === t ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                  color: type === t ? 'white' : 'var(--text-primary)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                {filterLabel(t)}
              </button>
            ))}
          </div>
        </form>

        {/* Loading State */}
        {loading && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p>Searching...</p>
          </div>
        )}

        {/* Results */}
        {!loading && results && (
          <>
            {/* Results Summary */}
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ color: 'var(--text-secondary)' }}>
                Found <strong>{results.total}</strong> result{results.total !== 1 ? 's' : ''} for "{results.query}"
              </p>
            </div>

            {/* No Results */}
            {results.total === 0 && (
              <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>No results found</p>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Try a different search term or filter
                </p>
              </div>
            )}

            {/* Results List */}
            {results.total > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {RESULT_GROUPS.flatMap((group) => (
                  (results[group] || [])
                    .filter((item) => !hiddenResultKeys.has(resultKey(item, group)))
                    .map((item) => (
                    <SearchResultItem
                      key={resultKey(item, group)}
                      item={item}
                      query={results.query}
                      onNavigate={handleNavigate}
                      onAction={handleResultAction}
                      getTypeLabel={getTypeLabel}
                      getTypeColor={getTypeColor}
                      highlightMatch={highlightMatch}
                    />
                  ))
                ))}
              </div>
            )}
          </>
        )}

        {/* Empty State */}
        {!loading && !hasSearched && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>Start searching</p>
            <p style={{ color: 'var(--text-secondary)' }}>
              Enter a search term to find entries, tasks, goals, notes, and more
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchResultItem({ item, query, onNavigate, onAction, getTypeLabel, getTypeColor, highlightMatch }) {
  const getTitle = () => {
    if (item.title) return item.title;
    if (item.name) return item.name;
    if (item.date) return `Entry from ${item.date}`;
    return 'Untitled';
  };

  const destination = primaryDestination(item);
  const sourcePath = sourceEntryPath(item);
  const where = locationText(item);
  const actions = [];
  if (destination) actions.push({ key: 'open', label: destination.label });
  if (sourcePath && item.type !== 'entry') actions.push({ key: 'openSource', label: 'Open source entry' });
  if (item.type === 'task' && !item.completed) actions.push({ key: 'completeTask', label: 'Complete task' });
  if (isSuggestion(item) && destination?.path !== '/review') {
    actions.push({ key: 'review', label: 'Review suggestion' });
  }

  return (
    <div
      className="card"
      style={{
        cursor: 'pointer',
        transition: 'all 0.2s',
        borderLeft: `4px solid ${getTypeColor(item.type)}`
      }}
      onClick={() => onNavigate(item)}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = getTypeColor(item.type);
        e.currentTarget.style.transform = 'translateX(4px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'transparent';
        e.currentTarget.style.transform = 'translateX(0)';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.125rem' }}>{highlightMatch(getTitle(), query)}</h3>
        <span
          style={{
            padding: '0.25rem 0.5rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: getTypeColor(item.type),
            color: 'white',
            borderRadius: '4px',
            whiteSpace: 'nowrap'
          }}
        >
          {getTypeLabel(item.type)}
        </span>
      </div>

      {item.preview && (
        <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 0 0', fontSize: '0.95rem' }}>
          {highlightMatch(item.preview, query)}
        </p>
      )}

      {where && (
        <p className="search-result__location">
          {where}
          {item.source === 'entry-automation' ? ' · from entry automation' : ''}
        </p>
      )}

      {item.date && !where && (
        <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', margin: '0.5rem 0 0 0' }}>
          {item.date}
        </p>
      )}

      {item.status && (
        <span
          style={{
            display: 'inline-block',
            marginTop: '0.5rem',
            padding: '0.25rem 0.5rem',
            fontSize: '0.75rem',
            background: item.completed ? '#10B981' : '#6B7280',
            color: 'white',
            borderRadius: '4px'
          }}
        >
          {item.status}
        </span>
      )}

      <div className="search-result__actions">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className="review-button review-button--ghost"
            onClick={(event) => {
              event.stopPropagation();
              onAction(item, action.key);
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
