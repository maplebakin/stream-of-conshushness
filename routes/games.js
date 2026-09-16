import express from 'express';
import Game from '../models/Game.js';
import GameNote from '../models/GameNote.js';
import auth from '../middleware/auth.js';
import { logSafeError } from '../utils/errorHandler.js';

const router = express.Router();

/** helper: normalize user id across JWT shapes */
function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}

function asyncRoute(context, handler) {
  return async (req, res, next) => {
    try {
      return await handler(req, res, next);
    } catch (error) {
      logSafeError(context, error);
      if (res.headersSent) return next(error);
      return res.status(500).json({ error: 'Server error' });
    }
  };
}

// GET all games for logged-in user
router.get('/', auth, asyncRoute('games list failed', async (req, res) => {
  const games = await Game.find({ userId: getUserId(req) }).sort({ createdAt: -1 });
  res.json(games);
}));

// POST create a new game
router.post('/', auth, asyncRoute('games create failed', async (req, res) => {
  const { title, description, imageUrl } = req.body;
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  if (!normalizedTitle) return res.status(400).json({ error: 'title is required' });
  const slug = normalizedTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (!slug) return res.status(400).json({ error: 'title must contain letters or numbers' });

  const userId = getUserId(req);
  const existingSlug = await Game.exists({ userId, slug });
  if (existingSlug) {
    return res.status(409).json({ error: 'You already have a game with this slug' });
  }

  const game = new Game({
    userId,
    title: normalizedTitle,
    slug,
    description: description || '',
    imageUrl: imageUrl || ''
  });

  await game.save();
  res.status(201).json(game);
}));

// GET one game by slug
router.get('/:slug', auth, asyncRoute('game get failed', async (req, res) => {
  const game = await Game.findOne({ userId: getUserId(req), slug: req.params.slug });
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
}));

// PATCH update a game
router.patch('/:slug', auth, asyncRoute('game update failed', async (req, res) => {
  const { title, description, imageUrl } = req.body;
  const update = {};
  if (typeof title === 'string') update.title = title;
  if (typeof description === 'string') update.description = description;
  if (typeof imageUrl === 'string') update.imageUrl = imageUrl;

  const game = await Game.findOneAndUpdate(
    { userId: getUserId(req), slug: req.params.slug },
    update,
    { new: true }
  );
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
}));

// DELETE a game
router.delete('/:slug', auth, asyncRoute('game delete failed', async (req, res) => {
  const out = await Game.deleteOne({ userId: getUserId(req), slug: req.params.slug });
  if (out.deletedCount === 0) return res.status(404).json({ error: 'Game not found' });
  res.sendStatus(204);
}));

/* ---------- notes (optional) ---------- */

// GET notes for a game
router.get('/:slug/notes', auth, asyncRoute('game notes list failed', async (req, res) => {
  const game = await Game.findOne({ userId: getUserId(req), slug: req.params.slug });
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const notes = await GameNote.find({ userId: getUserId(req), gameId: game._id }).sort({ createdAt: -1 });
  res.json(notes);
}));

// POST a new note for a game
router.post('/:slug/notes', auth, asyncRoute('game note create failed', async (req, res) => {
  const game = await Game.findOne({ userId: getUserId(req), slug: req.params.slug });
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const note = new GameNote({
    userId: getUserId(req),
    gameId: game._id,
    content: String(req.body.content || '').trim()
  });
  await note.save();
  res.status(201).json(note);
}));

export default router;
