import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock UserService before importing routes
const mockUserServiceInstance = {
  getPublicProfile: vi.fn(),
  getMyProfile: vi.fn(),
  listUsers: vi.fn(),
  suspendUser: vi.fn(),
  updateUserRole: vi.fn(),
};

vi.mock('../../src/services/user.service.js', () => ({
  UserService: vi.fn().mockImplementation(() => mockUserServiceInstance),
}));

vi.mock('../../src/middleware/auth.middleware.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-123', publicKey: 'pk-admin', tier: 'BEGINNER' };
    next();
  },
}));

vi.mock('../../src/middleware/admin.middleware.js', () => ({
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../src/repositories/user.repository.js', () => ({
  UserRepository: vi.fn().mockImplementation(() => ({
    findById: vi.fn().mockResolvedValue({ id: 'user-123', isActive: true }),
  })),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Import routes after mocks are set up
const { default: usersRoutes } = await import('../../src/routes/users.routes.js');

describe('Users Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/users', usersRoutes);
  });

  describe('GET /api/users/:id (issue #35 — public profile)', () => {
    it('returns public profile for any user', async () => {
      const profile = {
        id: 'user-abc',
        username: 'alice',
        avatarUrl: null,
        createdAt: new Date().toISOString(),
        totalPredictions: 10,
        winRate: 60,
      };
      mockUserServiceInstance.getPublicProfile.mockResolvedValue(profile);

      const res = await request(app).get('/api/users/user-abc');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({ username: 'alice', totalPredictions: 10, winRate: 60 });
    });

    it('returns 404 if user not found', async () => {
      mockUserServiceInstance.getPublicProfile.mockRejectedValue(new Error('User not found'));

      const res = await request(app).get('/api/users/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/users/me (issue #35 — full profile)', () => {
    it('returns full profile for authenticated user', async () => {
      const profile = {
        id: 'user-123',
        username: 'alice',
        email: 'alice@example.com',
        walletAddress: 'GXXX',
        referralCode: 'REF123',
        totalPredictions: 5,
        winRate: 80,
      };
      mockUserServiceInstance.getMyProfile.mockResolvedValue(profile);

      const res = await request(app).get('/api/users/me');

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ email: 'alice@example.com', referralCode: 'REF123' });
    });
  });

  describe('GET /api/users (issue #37 — admin list)', () => {
    it('returns paginated user list', async () => {
      const result = { users: [], total: 0, page: 1, limit: 20 };
      mockUserServiceInstance.listUsers.mockResolvedValue(result);

      const res = await request(app).get('/api/users');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(result);
    });

    it('passes filters to service', async () => {
      mockUserServiceInstance.listUsers.mockResolvedValue({ users: [], total: 0, page: 1, limit: 20 });

      await request(app).get('/api/users?role=EXPERT&status=active&search=alice&page=2&limit=10');

      expect(mockUserServiceInstance.listUsers).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'EXPERT', status: 'active', search: 'alice', page: 2, limit: 10 })
      );
    });

    it('returns 400 for invalid role', async () => {
      const res = await request(app).get('/api/users?role=SUPERADMIN');
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/users/:id/suspend (issue #37)', () => {
    it('suspends a user', async () => {
      mockUserServiceInstance.suspendUser.mockResolvedValue({ success: true });

      const res = await request(app).patch('/api/users/user-abc/suspend');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockUserServiceInstance.suspendUser).toHaveBeenCalledWith('user-abc');
    });

    it('returns 404 if user not found', async () => {
      mockUserServiceInstance.suspendUser.mockRejectedValue(new Error('User not found'));

      const res = await request(app).patch('/api/users/nonexistent/suspend');

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/users/:id/role (issue #37)', () => {
    it('updates user role', async () => {
      mockUserServiceInstance.updateUserRole.mockResolvedValue({ id: 'user-abc', tier: 'EXPERT' });

      const res = await request(app)
        .patch('/api/users/user-abc/role')
        .send({ role: 'EXPERT' });

      expect(res.status).toBe(200);
      expect(res.body.data.tier).toBe('EXPERT');
    });

    it('returns 400 for invalid role', async () => {
      const res = await request(app)
        .patch('/api/users/user-abc/role')
        .send({ role: 'SUPERADMIN' });

      expect(res.status).toBe(400);
    });

    it('returns 404 if user not found', async () => {
      mockUserServiceInstance.updateUserRole.mockRejectedValue(new Error('User not found'));

      const res = await request(app)
        .patch('/api/users/nonexistent/role')
        .send({ role: 'EXPERT' });

      expect(res.status).toBe(404);
    });
  });
});
