import { redis } from '../config/redis';

export { redis };

export async function cacheGet<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  return data ? (JSON.parse(data) as T) : null;
}

export async function cacheSet(key: string, value: unknown, ttl_seconds: number): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', ttl_seconds);
}

export async function cacheDelete(key: string): Promise<void> {
  await redis.del(key);
}

export async function cacheDeletePattern(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) await redis.del(...keys);
}
