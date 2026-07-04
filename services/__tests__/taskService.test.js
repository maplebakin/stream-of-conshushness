// services/__tests__/taskService.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTasks } from '../taskService.js';
import Task from '../../models/Task.js';
import { resolveClusterIdForOwner } from '../../utils/clusterIds.js';

// Mock the dependencies
vi.mock('../../models/Task.js', () => ({
  default: {
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('../../utils/clusterIds.js', () => ({
  resolveClusterIdForOwner: vi.fn(),
}));

describe('taskService', () => {
  describe('getTasks', () => {
    let mockQuery;

    beforeEach(() => {
      // Reset mocks before each test
      vi.clearAllMocks();

      // Mock chainable Mongoose query methods
      mockQuery = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]), // Default to resolving with an empty array
      };
      Task.find.mockReturnValue(mockQuery);
      Task.countDocuments.mockResolvedValue(0);
    });

    it('should build a basic query for a user', async () => {
      const userId = 'user123';
      const query = {};

      await getTasks(userId, query);

      expect(Task.find).toHaveBeenCalledWith({
        userId,
        deletedAt: null,
        completed: false, // Default behavior
      });
      expect(mockQuery.sort).toHaveBeenCalledWith({ completed: 1, dueDate: 1, createdAt: -1 });
      expect(mockQuery.limit).toHaveBeenCalledWith(200); // Default limit
      expect(mockQuery.skip).toHaveBeenCalledWith(0); // Default offset
    });

    it('should handle date filtering', async () => {
      const userId = 'user123';
      const query = { date: '2025-12-02' };

      await getTasks(userId, query);

      const calledWith = Task.find.mock.calls[0][0];
      expect(calledWith.$and).toEqual(expect.arrayContaining([
        expect.objectContaining({ dueDate: '2025-12-02' }),
      ]));
    });

    it('should handle completed filter', async () => {
      const userId = 'user123';
      const query = { completed: 'true' };

      await getTasks(userId, query);

      expect(Task.find).toHaveBeenCalledWith(expect.objectContaining({
        completed: true,
      }));
    });

    it('should handle includeCompleted filter', async () => {
      const userId = 'user123';
      const query = { includeCompleted: 'true' };

      await getTasks(userId, query);

      // When includeCompleted is true, the 'completed' field should not be in the query
      expect(Task.find).not.toHaveBeenCalledWith(expect.objectContaining({
        completed: expect.any(Boolean),
      }));
    });

    it('should handle cluster filtering by slug', async () => {
      const userId = 'user123';
      const query = { cluster: 'personal' };
      const clusterId = 'cluster456';
      resolveClusterIdForOwner.mockResolvedValue(clusterId);

      await getTasks(userId, query);

      expect(resolveClusterIdForOwner).toHaveBeenCalledWith(userId, 'personal');
      expect(Task.find).toHaveBeenCalledWith(expect.objectContaining({
        clusters: clusterId,
      }));
    });

    it('should return an empty array if a specified cluster is not found', async () => {
      const userId = 'user123';
      const query = { cluster: 'nonexistent' };
      resolveClusterIdForOwner.mockResolvedValue(null);

      const result = await getTasks(userId, query);

      expect(result).toEqual([]);
      expect(Task.find).not.toHaveBeenCalled();
    });

    it('should return a count for countOnly queries', async () => {
      const userId = 'user123';
      const query = { view: 'inbox', countOnly: '1' };
      Task.countDocuments.mockResolvedValue(4);

      const result = await getTasks(userId, query);

      expect(result).toEqual({ count: 4 });
      expect(Task.countDocuments).toHaveBeenCalledWith(expect.objectContaining({
        userId,
        deletedAt: null,
        completed: false,
      }));
      expect(Task.find).not.toHaveBeenCalled();
    });

    it('should handle pagination with limit and offset', async () => {
      const userId = 'user123';
      const query = { limit: '50', offset: '10' };

      await getTasks(userId, query);

      expect(mockQuery.limit).toHaveBeenCalledWith(50);
      expect(mockQuery.skip).toHaveBeenCalledWith(10);
    });
  });
});
