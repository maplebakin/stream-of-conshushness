import { useParams } from 'react-router-dom';

export default function GamePage() {
  const { slug } = useParams();

  return (
    <div className="game-page">
      <h2>🎮 {slug.replace(/-/g, ' ')} Game Page</h2>
      <p>This will show entries and notes for this game.</p>
    </div>
  );
}
