import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationService } from '../../src/services/notification.service.js';
import { NotificationType } from '@prisma/client';

vi.mock('../../src/repositories/notification.repository.js');
vi.mock('../../src/repositories/user.repository.js');
vi.mock('../../src/websocket/realtime.js', () => ({
  pushNotificationToUser: vi.fn(),
}));
vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { pushNotificationToUser } from '../../src/websocket/realtime.js';

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  notifyPredictionResult: true,
  notifyMarketResolution: true,
  notifyWinnings: true,
  notifyAchievements: true,
  emailNotifications: false,
};

const mockNotification = {
  id: 'notif-abc',
  userId: 'user-123',
  type: NotificationType.SYSTEM,
  title: 'Hello',
  message: 'World',
  isRead: false,
  createdAt: new Date(),
};

describe('NotificationService.sendNotification', () => {
  let service: NotificationService;
  let mockNotifRepo: any;
  let mockUserRepo: any;
  let mockIo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockNotifRepo = { createNotification: vi.fn().mockResolvedValue(mockNotification) };
    mockUserRepo = { findById: vi.fn().mockResolvedValue(mockUser) };
    mockIo = { to: vi.fn().mockReturnThis(), emit: vi.fn() };

    service = new NotificationService(mockNotifRepo, mockUserRepo);
  });

  it('saves notification to DB via repository', async () => {
    const result = await service.sendNotification('user-123', NotificationType.SYSTEM, {
      title: 'Hello',
      message: 'World',
    });

    expect(mockNotifRepo.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        type: NotificationType.SYSTEM,
        title: 'Hello',
        message: 'World',
      })
    );
    expect(result).toEqual(mockNotification);
  });

  it('pushes real-time notification via WebSocket when io is set', async () => {
    service.setSocketIO(mockIo);

    await service.sendNotification('user-123', NotificationType.SYSTEM, {
      title: 'Hello',
      message: 'World',
    });

    expect(pushNotificationToUser).toHaveBeenCalledWith(
      mockIo,
      'user-123',
      expect.objectContaining({ id: mockNotification.id, type: mockNotification.type })
    );
  });

  it('skips WebSocket push when io is not set', async () => {
    await service.sendNotification('user-123', NotificationType.SYSTEM, {
      title: 'Hello',
      message: 'World',
    });

    expect(pushNotificationToUser).not.toHaveBeenCalled();
  });

  it('returns null when user not found', async () => {
    mockUserRepo.findById.mockResolvedValue(null);

    const result = await service.sendNotification('user-123', NotificationType.SYSTEM, {
      title: 'Hello',
      message: 'World',
    });

    expect(result).toBeNull();
    expect(mockNotifRepo.createNotification).not.toHaveBeenCalled();
  });

  it.each([
    [NotificationType.DISPUTE_FILED],
    [NotificationType.DISPUTE_RESOLVED],
    [NotificationType.TRADE_FILLED],
    [NotificationType.REFUND_AVAILABLE],
    [NotificationType.MARKET_RESOLVED],
    [NotificationType.WINNINGS_AVAILABLE],
    [NotificationType.SYSTEM],
  ])('saves notification for type %s', async (type) => {
    mockNotifRepo.createNotification.mockResolvedValue({ ...mockNotification, type });

    const result = await service.sendNotification('user-123', type, {
      title: 'T',
      message: 'M',
    });

    expect(mockNotifRepo.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type })
    );
    expect(result).not.toBeNull();
  });
});
