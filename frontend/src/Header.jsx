import { Link } from 'react-router-dom';
import './Main.css';

export default function Header() {
  return (
    <header>
      <h1>Stream of Conshushness</h1>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/calendar">Calendar</Link>
        <Link to="/section/games">Games</Link>
        <Link to="/sections">Manage Sections</Link> {/* 👈 new link here */}
      </nav>
    </header>
  );
}
