import { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import { Link } from 'react-router-dom';

export default function GameList() {
  const { token } = useContext(AuthContext);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');

  useEffect(() => {
    if (!token) return;
    axios
      .get('/api/games', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        setGames(Array.isArray(res.data) ? res.data : []);
        setError('');
      })
      .catch((err) => {
        console.error('⚠️ Error fetching games:', err);
        setError(err?.response?.data?.error || 'Could not load games.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
    setNewTitle('');
    setNewDescription('');
    setError('');
  };

  const handleAddGame = async (event) => {
    event?.preventDefault?.();
    if (!newTitle.trim()) return;
    setSaving(true);
    setError('');
    try {
      const { data: created } = await axios.post(
        '/api/games',
        {
          title: newTitle.trim(),
          description: newDescription.trim(),
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setNewTitle('');
      setNewDescription('');
      setShowModal(false);
      setGames((current) => {
        if (!created?._id) return current;
        return [created, ...current.filter((game) => game._id !== created._id)];
      });
    } catch (err) {
      console.error('Error adding game:', err);
      setError(err?.response?.data?.error || 'Could not add the game.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading games...</p>;

  return (
    <div className="game-list">
      <h2>🎮 Your Games</h2>

      <button type="button" onClick={() => { setError(''); setShowModal(true); }}>+ Add Game</button>

      {error && !showModal && <div className="alert error" role="alert">{error}</div>}

      {showModal && (
        <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && closeModal()}>
          <form className="modal-card" onSubmit={handleAddGame} aria-busy={saving}>
            <h3>Add a New Game</h3>
            <label className="field">
              <span>Title</span>
              <input
                type="text"
                placeholder="Game title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                disabled={saving}
                autoFocus
                required
              />
            </label>
            <label className="field">
              <span>Description (optional)</span>
              <textarea
                placeholder="Description (optional)"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                disabled={saving}
              />
            </label>
            {error && <div className="alert error" role="alert">{error}</div>}
            <div className="modal-actions">
              <button type="submit" disabled={saving || !newTitle.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={closeModal} disabled={saving}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {games.length === 0 ? (
        <div className="empty-state" style={{ textAlign: 'center', marginTop: 32 }}>
          <div style={{ fontSize: 36, opacity: 0.3 }}>🎮</div>
          <p>No games yet. Add your first game!</p>
        </div>
      ) : (
        <ul>
          {games.map((game) => (
            <li key={game._id}>
              <Link to={`/section/games/${game.slug}`}>{game.title}</Link>
              {/* Optionally show description: */}
              {/* <div style={{ fontSize: '0.9em', color: '#888' }}>{game.description}</div> */}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
