import { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import { Link } from 'react-router-dom';

export default function GameList() {
  const { token } = useContext(AuthContext);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

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
        setGames(res.data);
      })
      .catch((err) => {
        console.error('⚠️ Error fetching games:', err);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleAddGame = async () => {
    if (!newTitle.trim()) return;
    try {
      await axios.post(
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

      // Refresh game list
      const res = await axios.get('/api/games', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGames(res.data);
    } catch (err) {
      console.error('Error adding game:', err);
    }
  };

  if (loading) return <p>Loading games...</p>;

  return (
    <div className="game-list">
      <h2>🎮 Your Games</h2>

      <button onClick={() => setShowModal(true)}>+ Add Game</button>

      {showModal && (
        <div className="modal">
          <h3>Add a New Game</h3>
          <input
            type="text"
            placeholder="Game title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <textarea
            placeholder="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
          <div className="modal-actions">
            <button onClick={handleAddGame}>Save</button>
            <button onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </div>
      )}

      <ul>
        {games.map((game) => (
          <li key={game._id}>
            <Link to={`/section/games/${game.slug}`}>{game.title}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
