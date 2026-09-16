// frontend/src/pages/GlobalSearch.jsx
// Global search page

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { completeSearchTask, searchContent } from '../api/search.js';
import toast from 'react-hot-toast';
import { sourceEntryPath, sourceStateLabel } from '../utils/sourceEntryState.js';
import { requestErrorSummary } from '../utils/requestError.js';
import { CalmEmptyState, SecondarySection } from '../components/UXPrimitives.jsx';
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

function readableDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return value || '';
  return new Date(`${value}T12:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
    case 'researchSubject':
      return item.sectionSlug && item._id
        ? { path: `/research/${encodeURIComponent(item.sectionSlug)}?subject=${encodeURIComponent(item._id)}`, label: 'Open research subject' }
        : { path: '/sections', label: 'Open research' };
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
      return item.date ? `Entry from ${readableDate(item.date)}` : 'Entry';
    case 'task':
      return item.dueDate ? `Task due ${readableDate(item.dueDate)}` : 'Task in Task Inbox';
    case 'note':
      return item.date ? `Note from ${readableDate(item.date)}` : 'Note';
    case 'appointment':
      return item.date ? `Appointment on ${readableDate(item.date)}` : 'Appointment in Calendar';
    case 'importantEvent':
      return item.date ? `Event on ${readableDate(item.date)}` : 'Event in Calendar';
    case 'scheduleItem':
      return item.date ? `Schedule block on ${readableDate(item.date)}` : 'Schedule block';
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
      return item.status ? `Saved habit record · ${item.status}` : 'Saved habit record';
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
  const [busyResultKeys, setBusyResultKeys] = useState(() => new Set());
  const searchSequenceRef = useRef(0);
  const busyResultKeysRef = useRef(new Set());

  // Perform search when query params change
  useEffect(() => {
    const q = searchParams.get('q');
    const t = searchParams.get('type') || 'all';

    if (q && q.length >= 2) {
      setQuery(q);
      setType(t);
      performSearch(q, t);
      return;
    }

    // Navigating back to a bare/short search invalidates any older request so
    // it cannot repopulate a page that no longer represents that query.
    searchSequenceRef.current += 1;
    setQuery(q || '');
    setType(t);
    setResults(null);
    setHiddenResultKeys(new Set());
    setHasSearched(false);
    setLoading(false);
  }, [searchParams]);

  const performSearch = async (searchQuery, searchType) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      toast.error('Search query must be at least 2 characters');
      return;
    }

    const sequence = searchSequenceRef.current + 1;
    searchSequenceRef.current = sequence;
    try {
      setLoading(true);
      setHasSearched(true);

      const response = await searchContent(searchQuery, searchType);
      if (sequence !== searchSequenceRef.current) return;

      setResults(response.data);
      setHiddenResultKeys(new Set());
    } catch (error) {
      if (sequence !== searchSequenceRef.current) return;
      console.error('Search failed:', requestErrorSummary(error));
      toast.error('Search failed. Please try again.');
      setResults(null);
    } finally {
      if (sequence === searchSequenceRef.current) setLoading(false);
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
    const key = resultKey(item);
    if (busyResultKeysRef.current.has(key)) return;
    if (action === 'completeTask') {
      busyResultKeysRef.current.add(key);
      setBusyResultKeys((current) => new Set([...current, key]));
    }
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
        await completeSearchTask(item._id);
        setHiddenResultKeys((current) => new Set([...current, key]));
        setResults((current) => current ? { ...current, total: Math.max(0, current.total - 1) } : current);
        toast.success('Task completed.');
        return;
      }

      if (action === 'review') {
        navigate('/review');
        return;
      }
    } catch (error) {
      console.error('[GlobalSearch] action failed:', requestErrorSummary(error));
      toast.error(error?.response?.data?.error || 'Could not update this result.');
    } finally {
      if (action === 'completeTask') {
        busyResultKeysRef.current.delete(key);
        setBusyResultKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
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
    <div className="page search-page">
      <div className="search-page__inner">
        <header className="search-page__header">
          <p className="page-eyebrow">Recovery space</p>
          <h1 className="page-title">Find your thread</h1>
          <p className="page-subtitle">Search across captures, tasks, plans, and the details the app connected for you.</p>
        </header>

        {/* Search Form */}
        <form className="search-page__form" onSubmit={handleSearch}>
          <div className="search-page__field-row">
            <label className="sr-only" htmlFor="global-search-query">Search your private content</label>
            <input
              id="global-search-query"
              type="text"
              className="search-page__field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search across all your content..."
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || query.trim().length < 2}
              className="button search-page__submit"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          <SecondarySection summary="Narrow the search" hint={type === 'all' ? 'Everything' : filterLabel(type)}>
            <div className="search-page__filters" aria-label="Search result filters">
              {SEARCH_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className={`search-page__filter${type === t ? ' is-active' : ''}`}
                  aria-pressed={type === t}
                >
                  {filterLabel(t)}
                </button>
              ))}
            </div>
          </SecondarySection>
        </form>

        {/* Loading State */}
        {loading && (
          <div className="card search-state search-state--loading" role="status" aria-live="polite">
            <p>Searching...</p>
          </div>
        )}

        {/* Results */}
        {!loading && results && (
          <>
            {/* Results Summary */}
            <div className="search-results-summary" role="status" aria-live="polite">
              <p>
                Found <strong>{results.total}</strong> result{results.total !== 1 ? 's' : ''} for "{results.query}"
              </p>
            </div>

            {/* No Results */}
            {results.total === 0 && (
              <CalmEmptyState title="That thread hasn’t surfaced">
                Try another phrase, or widen the search to everything.
              </CalmEmptyState>
            )}

            {/* Results List */}
            {results.total > 0 && (
              <div className="search-results-list">
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
                      busy={busyResultKeys.has(resultKey(item, group))}
                    />
                  ))
                ))}
              </div>
            )}
          </>
        )}

        {/* Empty State */}
        {!loading && !hasSearched && (
          <CalmEmptyState title="What are you trying to find?">
            Search a person, phrase, task, place, or half-remembered thought.
          </CalmEmptyState>
        )}
      </div>
    </div>
  );
}

function SearchResultItem({ item, query, onAction, getTypeLabel, getTypeColor, highlightMatch, busy }) {
  const getTitle = () => {
    if (item.title) return item.title;
    if (item.name) return item.name;
    if (item.date) return `Entry from ${item.date}`;
    return 'Untitled';
  };

  const destination = primaryDestination(item);
  const sourcePath = sourceEntryPath(item);
  const sourceState = sourceStateLabel(item);
  const where = locationText(item);
  const actions = [];
  if (destination) actions.push({ key: 'open', label: destination.label });
  if (sourcePath && item.type !== 'entry') actions.push({ key: 'openSource', label: 'Open source entry' });
  if (item.type === 'task' && !item.completed) actions.push({ key: 'completeTask', label: 'Complete task' });
  if (isSuggestion(item) && destination?.path !== '/review') {
    actions.push({ key: 'review', label: 'Review suggestion' });
  }

  return (
    <article
      className="card search-result"
      style={{ '--result-accent': getTypeColor(item.type) }}
    >
      <div className="search-result__header">
        <h3>{highlightMatch(getTitle(), query)}</h3>
        <span
          className="search-result__type"
        >
          {getTypeLabel(item.type)}
        </span>
      </div>

      {item.preview && (
        <p className="search-result__preview">
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
        <p className="search-result__date">
          {item.date}
        </p>
      )}

      {item.status && (
        <span className={`search-result__status${item.completed ? ' is-complete' : ''}`}>
          {item.status}
        </span>
      )}

      {sourceState && (
        <p className="search-result__location" aria-label={sourceState}>{sourceState}</p>
      )}

      <div className="search-result__actions">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className="review-button review-button--ghost"
            disabled={busy}
            aria-busy={busy && action.key === 'completeTask' ? 'true' : undefined}
            onClick={(event) => {
              event.stopPropagation();
              onAction(item, action.key);
            }}
          >
            {busy && action.key === 'completeTask' ? 'Completing…' : action.label}
          </button>
        ))}
      </div>
    </article>
  );
}
