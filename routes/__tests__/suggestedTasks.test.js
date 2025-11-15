// routes/__tests__/suggestedTasks.test.js

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

const mockFindOne = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockResolveClusterIdForOwner = vi.hoisted(() => vi.fn());

vi.mock('../../models/SuggestedTask.js', () => ({
  default: {
    findOne: mockFindOne,
  },
}));

vi.mock('../../models/Task.js', () => ({
  default: {
    create: mockCreate,
  },
}));

vi.mock('../../utils/clusterIds.js', () => ({
  resolveClusterIdForOwner: mockResolveClusterIdForOwner,
}));

// Import router after mocks are configured
import router from '../suggestedTasks.js';

describe('Suggested Tasks acceptance', () => {
  const userId = new mongoose.Types.ObjectId();
  const resolvedClusterId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveClusterIdForOwner.mockResolvedValue(resolvedClusterId);
  });

  it('normalizes due date, priority, and cluster data when accepting a suggestion', async () => {
    const dueDate = new Date('2025-02-01T10:20:30Z');

    const save = vi.fn().mockResolvedValue();
    const suggestedTaskDoc = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: 'Review quarterly goals',
      priority: 'high',
      dueDate,
      repeat: 'weekly',
      cluster: 'focus-zone',
      status: 'pending',
      save,
    };

    mockFindOne.mockResolvedValue(suggestedTaskDoc);
    mockCreate.mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: suggestedTaskDoc.title,
    });

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { userId };
      next();
    });
    app.use('/api/suggested-tasks', router);

    const res = await request(app).put(`/api/suggested-tasks/${suggestedTaskDoc._id.toString()}/accept`);

    expect(res.status).toBe(200);
    expect(mockFindOne).toHaveBeenCalledWith({
      _id: suggestedTaskDoc._id.toString(),
      userId: userId,
      status: 'pending',
    });
    expect(mockResolveClusterIdForOwner).toHaveBeenCalledWith(userId, 'focus-zone');
    expect(mockCreate).toHaveBeenCalledWith({
      userId,
      title: 'Review quarterly goals',
      priority: 2,
      dueDate: '2025-02-01',
      rrule: 'weekly',
      clusters: [resolvedClusterId],
    });
    expect(suggestedTaskDoc.status).toBe('accepted');
    expect(save).toHaveBeenCalled();
    expect(res.body).toHaveProperty('task');
    expect(res.body).toHaveProperty('suggestedTask');
  });
});
