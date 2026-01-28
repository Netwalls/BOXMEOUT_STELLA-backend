import { config } from 'dotenv';
config(); // Load environment variables before anything else

// Set default env vars for testing if not present
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ||
  'test-secret-access-token-minimum-32-characters-required';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  'test-secret-refresh-token-minimum-32-characters-required';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:password@localhost:5432/boxmeout_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { beforeAll, afterAll } from 'vitest';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL_TEST ||
        process.env.DATABASE_URL ||
        'postgresql://postgres:password@localhost:5432/boxmeout_test',
    },
  },
});

let isSetup = false;

// Run migrations before tests (once)
beforeAll(async () => {
  if (!isSetup) {
    console.log('🔧 Setting up test database...');

    // Deploy migrations to test database
    try {
      execSync('npx prisma migrate deploy', {
        env: {
          ...process.env,
          DATABASE_URL:
            process.env.DATABASE_URL_TEST || process.env.DATABASE_URL,
        },
        stdio: 'pipe',
      });
    } catch (error) {
      // Migrations may already be applied
    }

    isSetup = true;
  }

  // Clean database before each test file
  await cleanDatabase();
});

async function cleanDatabase() {
  try {
    // Delete all data in reverse order of dependencies (sequentially to respect foreign keys)
    await prisma.trade.deleteMany();
    await prisma.prediction.deleteMany();
    await prisma.share.deleteMany();
    await prisma.dispute.deleteMany();
    await prisma.market.deleteMany();
    await prisma.achievement.deleteMany();
    await prisma.leaderboard.deleteMany();
    await prisma.referral.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  } catch (error) {
    console.warn('⚠️ Failed to clean database:', error);
  }
}

// Disconnect after all tests
afterAll(async () => {
  await prisma.$disconnect();
});

export { prisma };
