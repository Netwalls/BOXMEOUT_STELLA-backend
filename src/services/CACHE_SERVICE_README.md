# Cache Service Documentation

## Overview

The centralized cache service provides Redis-based caching with automatic invalidation capabilities. It prevents stale reads by ensuring cache keys are properly invalidated when underlying data changes.

## Features

- **Namespaced Keys**: Organized cache keys by domain (market, leaderboard, user)
- **Pattern-based Invalidation**: Bulk invalidation using Redis SCAN
- **Graceful Degradation**: Continues operation even when Redis is unavailable
- **Type-safe**: Full TypeScript support with generics
- **Get-or-Set Pattern**: Automatic cache population on miss

## API Reference

### Core Functions

#### `get<T>(key: string): Promise<T | null>`
Retrieves a value from cache by key.

```typescript
const market = await cache.get<Market>('market:abc123');
```

#### `set(key: string, value: unknown, ttl_seconds: number): Promise<void>`
Stores a value in cache with TTL.

```typescript
await cache.set('market:abc123', marketData, 60);
```

#### `del(key: string): Promise<void>`
Deletes a single cache key.

```typescript
await cache.del('market:abc123');
```

#### `delPattern(pattern: string): Promise<void>`
Deletes all keys matching a pattern using Redis SCAN.

```typescript
await cache.delPattern('market:*');
```

#### `getOrSet<T>(key: string, ttl_seconds: number, compute: () => Promise<T>): Promise<T>`
Gets a value from cache, or computes and caches it if missing.

```typescript
const stats = await cache.getOrSet(
  'market:abc123:stats',
  60,
  async () => await computeMarketStats('abc123')
);
```

## Cache Key Namespaces

### Market Keys
- `market:{id}` - Individual market data
- `market:{id}:stats` - Market statistics
- `markets:*` - Market list queries (with filters)

### Leaderboard Keys
- `leaderboard:global:*` - Global leaderboard data
- `leaderboard:global:top10` - Top 10 players
- `leaderboard:global:top100` - Top 100 players

### User Keys
- `user:{id}:balance` - User balance data
- `user:{id}:portfolio` - User portfolio data

### Platform Keys
- `platform:stats` - Platform-wide statistics

## Cache Invalidation Strategy

### When to Invalidate

Cache invalidation should occur after any write operation that modifies the underlying data:

1. **Market Updates**: After creating, updating, or resolving markets
2. **Bet Placement**: After a bet is placed (affects market pools and stats)
3. **User Balance Changes**: After deposits, withdrawals, or payouts
4. **Leaderboard Updates**: After significant user activity changes

### Invalidation Patterns

#### Single Key Invalidation
```typescript
// After updating a specific market
await cache.del(`market:${market_id}`);
```

#### Pattern-based Invalidation
```typescript
// After any market update that affects listings
await cache.delPattern('markets:*');

// After leaderboard recalculation
await cache.delPattern('leaderboard:global:*');
```

#### Combined Invalidation
```typescript
// Complete market cache invalidation
export async function invalidateMarketCache(market_id: string): Promise<void> {
  await cache.del(`market:${market_id}`);
  await cache.delPattern(`markets:*`);
  await cache.del(`market:${market_id}:stats`);
}
```

## Integration Examples

### MarketService Integration

```typescript
import * as cache from './cache.service';

export async function getMarketById(market_id: string): Promise<Market> {
  // Try cache first
  const cacheKey = `market:${market_id}`;
  const cached = await cache.get<Market>(cacheKey);
  if (cached) return cached;

  // Cache miss - fetch from DB
  const market = await db.findMarketById(market_id);
  
  // Store in cache
  await cache.set(cacheKey, market, 10);
  
  return market;
}

export async function updateMarket(market_id: string, updates: Partial<Market>): Promise<void> {
  // Update database
  await db.updateMarket(market_id, updates);
  
  // Invalidate cache
  await cache.del(`market:${market_id}`);
  await cache.delPattern('markets:*');
}
```

### WalletService Integration

```typescript
export async function getUserBalance(user_id: string): Promise<number> {
  return cache.getOrSet(
    `user:${user_id}:balance`,
    60,
    async () => await fetchBalanceFromBlockchain(user_id)
  );
}

export async function updateUserBalance(user_id: string, amount: number): Promise<void> {
  await db.updateBalance(user_id, amount);
  
  // Invalidate user balance cache
  await cache.del(`user:${user_id}:balance`);
}
```

### LeaderboardService Integration

```typescript
export async function getGlobalLeaderboard(): Promise<LeaderboardEntry[]> {
  return cache.getOrSet(
    'leaderboard:global:top100',
    120,
    async () => await computeLeaderboard()
  );
}

export async function recalculateLeaderboard(): Promise<void> {
  const leaderboard = await computeLeaderboard();
  
  // Invalidate all leaderboard caches
  await cache.delPattern('leaderboard:global:*');
  
  // Pre-populate cache
  await cache.set('leaderboard:global:top100', leaderboard, 120);
}
```

## Best Practices

### 1. Choose Appropriate TTLs
- **Frequently changing data**: 10-30 seconds (market odds, live stats)
- **Moderately stable data**: 60-300 seconds (market details, user profiles)
- **Rarely changing data**: 600-3600 seconds (platform stats, leaderboards)

### 2. Use Namespaced Keys
Always use consistent namespace prefixes to enable pattern-based invalidation:
```typescript
// Good
'market:abc123'
'user:user456:balance'
'leaderboard:global:top10'

// Bad
'abc123'
'balance_user456'
'top10'
```

### 3. Invalidate Proactively
Invalidate cache immediately after writes, don't wait for TTL expiration:
```typescript
// Good
await db.updateMarket(id, data);
await cache.del(`market:${id}`);

// Bad - relies on TTL
await db.updateMarket(id, data);
// Cache will serve stale data until TTL expires
```

### 4. Handle Redis Failures Gracefully
The cache service automatically handles Redis failures by:
- Returning `null` on read failures
- Logging warnings for debugging
- Continuing operation without caching

### 5. Use getOrSet for Read-Through Caching
Simplify cache logic with the get-or-set pattern:
```typescript
// Instead of this:
let data = await cache.get(key);
if (!data) {
  data = await computeData();
  await cache.set(key, data, ttl);
}

// Use this:
const data = await cache.getOrSet(key, ttl, computeData);
```

## Testing

The cache service includes comprehensive unit tests covering:
- Basic CRUD operations
- Pattern-based invalidation
- Error handling and graceful degradation
- Namespaced key operations
- Cache invalidation workflows

Run tests:
```bash
npm test -- cache.service.test.ts
```

## Performance Considerations

### Redis SCAN vs KEYS
The service uses `SCAN` instead of `KEYS` for pattern matching to avoid blocking the Redis server on large datasets.

### Batch Invalidation
When invalidating multiple keys, the service batches deletions:
```typescript
// Efficient - single DEL command
await redis.del('key1', 'key2', 'key3');

// Inefficient - multiple round trips
await redis.del('key1');
await redis.del('key2');
await redis.del('key3');
```

## Monitoring

Monitor cache effectiveness by tracking:
- Cache hit/miss ratios
- Redis connection failures
- Pattern invalidation frequency
- Key expiration rates

Add custom metrics as needed:
```typescript
export async function get<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  metrics.increment(data ? 'cache.hit' : 'cache.miss');
  return data ? JSON.parse(data) : null;
}
```

## Migration from Legacy API

The service maintains backward compatibility with legacy function names:
- `cacheGet` → `get`
- `cacheSet` → `set`
- `cacheDelete` → `del`
- `cacheDeletePattern` → `delPattern`

Both APIs work identically. Migrate to the new API gradually:
```typescript
// Old
import { cacheGet, cacheSet } from './cache.service';

// New
import * as cache from './cache.service';
```
