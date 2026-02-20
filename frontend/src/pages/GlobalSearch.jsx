// frontend/src/pages/GlobalSearch.jsx
// Global search page

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import toast from 'react-hot-toast';
import '../base.css';

export default function GlobalSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [type, setType] = useState(searchParams.get('type') || 'all');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

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
    switch (item.type) {
      case 'entry':
        navigate(`/day/${item.date}`);
        break;
      case 'task':
        navigate(item.dueDate ? `/day/${item.dueDate}` : '/');
        break;
      case 'goal':
        navigate('/');
        break;
      case 'note':
        navigate(`/day/${item.date}`);
        break;
      case 'section':
        navigate(`/sections/${item.slug}`);
        break;
      case 'sectionPage':
        navigate(`/sections/${item.sectionKey}/${item.slug}`);
        break;
      case 'cluster':
        navigate(`/clusters/${item.slug}`);
        break;
      default:
        break;
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
      cluster: 'Cluster'
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
      cluster: '#6366F1'
    };
    return colors[itemType] || '#6B7280';
  };

  const highlightMatch = (text, query) => {
    if (!text || !query) return text;

    const parts = text.split(new RegExp(`(${query})`, 'gi'));
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
            {['all', 'entries', 'tasks', 'goals', 'notes', 'sections', 'sectionPages', 'clusters'].map((t) => (
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
                {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
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
                {/* Entries */}
                {results.entries.map((item) => (
                  <SearchResultItem
                    key={`entry-${item._id}`}
                    item={item}
                    query={results.query}
                    onNavigate={handleNavigate}
                    getTypeLabel={getTypeLabel}
                    getTypeColor={getTypeColor}
                    highlightMatch={highlightMatch}
                  />
                ))}

                {/* Tasks */}
                {results.tasks.map((item) => (
                  <SearchResultItem
                    key={`task-${item._id}`}
                    item={item}
                    query={results.query}
                    onNavigate={handleNavigate}
                    getTypeLabel={getTypeLabel}
                    getTypeColor={getTypeColor}
                    highlightMatch={highlightMatch}
                  />
                ))}

                {/* Goals */}
                {results.goals.map((item) => (
                  <SearchResultItem
                    key={`goal-${item._id}`}
                    item={item}
                    query={results.query}
                    onNavigate={handleNavigate}
                    getTypeLabel={getTypeLabel}
                    getTypeColor={getTypeColor}
                    highlightMatch={highlightMatch}
                  />
                ))}

                {/* Notes */}
                {results.notes.map((item) => (
                  <SearchResultItem
                    key={`note-${item._id}`}
                    item={item}
                    query={results.query}
                    onNavigate={handleNavigate}
                    getTypeLabel={getTypeLabel}
                    getTypeColor={getTypeColor}
                    highlightMatch={highlightMatch}
                  />
                ))}

                {/* Sections */}
                {results.sections.map((item) => (
                  <SearchResultItem
                    key={`section-${item._id}`}
                    item={item}
                    query={results.query}
                    onNavigate={handleNavigate}
                    getTypeLabel={getTypeLabel}
                    getTypeColor={getTypeColor}
                    highlightMatch={highlightMatch}
                  />
                ))}

                {/* Section Pages */}
                {results.sectionPages.map((item) => (
                  <SearchResultItem
                    key={`page-${item._id}`}
                    item={item}
                    query={results.query}
                    onNavigate={handleNavigate}
                    getTypeLabel={getTypeLabel}
                    getTypeColor={getTypeColor}
                    highlightMatch={highlightMatch}
                  />
                ))}

                {/* Clusters */}
                {results.clusters.map((item) => (
                  <SearchResultItem
                    key={`cluster-${item._id}`}
                    item={item}
                    query={results.query}
                    onNavigate={handleNavigate}
                    getTypeLabel={getTypeLabel}
                    getTypeColor={getTypeColor}
                    highlightMatch={highlightMatch}
                  />
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

function SearchResultItem({ item, query, onNavigate, getTypeLabel, getTypeColor, highlightMatch }) {
  const getTitle = () => {
    if (item.title) return item.title;
    if (item.name) return item.name;
    if (item.date) return `Entry from ${item.date}`;
    return 'Untitled';
  };

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

      {item.date && (
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
    </div>
  );
}
