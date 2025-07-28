import express from 'express';
import Game from '../models/Game.js';
import GameNote from '../models/GameNote.js';
import { authenticateToken } from '../middleware/auth.js';


const router = express.Router();

// GET all games for logged-in user
router.get('/', authenticateToken, async (req, res) => {
  const games = await Game.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(games);
});

// POST create a new game
router.post('/', authenticateToken, async (req, res) => {
  const { title, description, imageUrl } = req.body;
  const slug = title.toLowerCase().replace(/\s+/g, '-');
  const newGame = new Game({ title, slug, description, imageUrl, userId: req.user.id });
  await newGame.save();
  res.status(201).json(newGame);
});

// GET one game + note
router.get('/:slug', authenticateToken, async (req, res) => {
  const game = await Game.findOne({ userId: req.user.id, slug: req.params.slug });
  if (!game) return res.status(404).json({ message: 'Game not found' });

  const note = await GameNote.findOne({ userId: req.user.id, gameId: game._id });
  res.json({ game, note });
});

// POST create/update note for a game
router.post('/:slug/notes', authenticateToken, async (req, res) => {
  const game = await Game.findOne({ userId: req.user.id, slug: req.params.slug });
  if (!game) return res.status(404).json({ message: 'Game not found' });

  const { content } = req.body;
  let note = await GameNote.findOne({ userId: req.user.id, gameId: game._id });

  if (!note) {
    note = new GameNote({ userId: req.user.id, gameId: game._id, content });
  } else {
    note.content = content;
    note.updatedAt = new Date();
  }

  await note.save();
  res.json(note);
});

export default router;
